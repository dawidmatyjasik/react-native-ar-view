package expo.modules.arview

import android.content.Context
import android.util.Log
import android.view.MotionEvent
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.TrackingFailureReason
import com.google.ar.core.TrackingState as ARTrackingState
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.ar.node.AnchorNode
import io.github.sceneview.node.ModelNode
import io.github.sceneview.gesture.GestureDetector
import io.github.sceneview.node.Node
import android.view.ScaleGestureDetector as AndroidScaleDetector
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.lang.ref.WeakReference

class ReactNativeArView(context: Context, appContext: AppContext) :
    ExpoView(context, appContext), LifecycleOwner {

    companion object {
        private const val TAG = "ReactNativeArView"
        // Static weak reference for module access
        var currentInstance: WeakReference<ReactNativeArView>? = null
    }

    // Events
    private val onTrackingStateChange by EventDispatcher()
    private val onPlaneDetected by EventDispatcher()
    private val onModelLoaded by EventDispatcher()
    private val onModelPlaced by EventDispatcher()
    private val onModelError by EventDispatcher()
    private val onSceneChange by EventDispatcher()
    private val onARError by EventDispatcher()

    // Lifecycle
    private val lifecycleRegistry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = lifecycleRegistry

    // Scene management
    private val sceneStack = ArrayDeque<ARSceneState>()
    private var currentModels: MutableList<ModelConfig> = mutableListOf()
    private val placedAnchors: MutableList<AnchorNode> = mutableListOf()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // Pending models waiting for tap-to-place
    private var pendingModelConfigs: MutableList<ModelConfig> = mutableListOf()
    private var currentPendingIndex = 0

    // Map model nodes to their configs for dampened scale gestures
    private val nodeConfigMap = mutableMapOf<ModelNode, ModelConfig>()

    // Currently active model node for scale gesture
    private var activeScaleNode: ModelNode? = null

    // Tracking
    private var lastTrackingState: String = "unavailable"
    private val detectedPlaneIds = mutableSetOf<String>()

    // Plane detection mode
    private var planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL

    // AR view
    internal val arSceneView: ARSceneView

    // Current frame reference for hit testing
    private var currentFrame: Frame? = null

    fun setPlaneDetection(mode: String) {
        planeFindingMode = when (mode) {
            "horizontal" -> Config.PlaneFindingMode.HORIZONTAL
            "vertical" -> Config.PlaneFindingMode.VERTICAL
            else -> Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
        }
        // Reconfigure the session if already running
        arSceneView.session?.let { session ->
            val config = session.config.apply {
                planeFindingMode = this@ReactNativeArView.planeFindingMode
            }
            session.configure(config)
        }
    }

    init {
        currentInstance = WeakReference(this)
        lifecycleRegistry.currentState = Lifecycle.State.CREATED

        arSceneView = try {
            ARSceneView(
                context = context,
                sessionConfiguration = { session, config ->
                    config.depthMode = when (session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                        true -> Config.DepthMode.AUTOMATIC
                        else -> Config.DepthMode.DISABLED
                    }
                    config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR
                    config.planeFindingMode = planeFindingMode
                },
                onSessionUpdated = { _, frame ->
                    handleFrameUpdate(frame)
                },
                onTrackingFailureChanged = { reason ->
                    handleTrackingFailure(reason)
                }
            ).apply {
                layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
                planeRenderer.isEnabled = true
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create ARSceneView", e)
            onARError(mapOf(
                "code" to "AR_VIEW_INIT_FAILED",
                "message" to (e.message ?: "Failed to initialize AR view")
            ))
            // Create a minimal ARSceneView so the field is initialized
            ARSceneView(context).apply {
                layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            }
        }

        addView(arSceneView)

        arSceneView.onGestureListener = object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapConfirmed(e: MotionEvent, node: Node?) {
                if (node == null) {
                    activeScaleNode = null
                    handleTapToPlace(e)
                } else {
                    activeScaleNode = (node as? ModelNode) ?: (node.parent as? ModelNode)
                }
            }
        }
    }

    // Our own scale detector - bypasses SceneView's built-in scale entirely
    private val scaleDetector = AndroidScaleDetector(context,
        object : AndroidScaleDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: AndroidScaleDetector): Boolean {
                val node = activeScaleNode ?: return false
                val config = nodeConfigMap[node] ?: return false
                if (!config.gestureScale) return false

                val rawFactor = detector.scaleFactor
                val sensitivity = config.gestureScaleSensitivity
                val dampenedFactor = 1f + (rawFactor - 1f) * sensitivity

                val currentScale = node.scale.x
                val newScale = (currentScale * dampenedFactor)
                    .coerceIn(config.gestureScaleMin..config.gestureScaleMax)
                node.scale = dev.romainguy.kotlin.math.Float3(newScale, newScale, newScale)
                return true
            }
        }
    )

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        scaleDetector.onTouchEvent(event)
        return super.dispatchTouchEvent(event)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        lifecycleRegistry.currentState = Lifecycle.State.RESUMED
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        scope.cancel()
        if (currentInstance?.get() === this) {
            currentInstance = null
        }
    }

    // --- Frame updates ---

    private fun handleFrameUpdate(frame: Frame) {
        currentFrame = frame

        val camera = frame.camera
        val newState = when (camera.trackingState) {
            ARTrackingState.TRACKING -> "normal"
            ARTrackingState.PAUSED -> "limited"
            ARTrackingState.STOPPED -> "unavailable"
        }
        if (newState != lastTrackingState) {
            lastTrackingState = newState
            onTrackingStateChange(mapOf("state" to newState))
        }

        for (plane in frame.getUpdatedTrackables(Plane::class.java)) {
            if (plane.trackingState == ARTrackingState.TRACKING) {
                val planeId = plane.hashCode().toString()
                if (planeId !in detectedPlaneIds) {
                    detectedPlaneIds.add(planeId)
                    val type = when (plane.type) {
                        Plane.Type.HORIZONTAL_UPWARD_FACING -> "horizontal"
                        Plane.Type.HORIZONTAL_DOWNWARD_FACING -> "horizontal"
                        Plane.Type.VERTICAL -> "vertical"
                    }
                    onPlaneDetected(mapOf("id" to planeId, "type" to type))
                }
            }
        }
    }

    private fun handleTrackingFailure(reason: TrackingFailureReason?) {
        if (reason == null || reason == TrackingFailureReason.NONE) return
        val reasonStr = when (reason) {
            TrackingFailureReason.BAD_STATE -> "bad_state"
            TrackingFailureReason.INSUFFICIENT_LIGHT -> "insufficient_light"
            TrackingFailureReason.EXCESSIVE_MOTION -> "excessive_motion"
            TrackingFailureReason.INSUFFICIENT_FEATURES -> "insufficient_features"
            TrackingFailureReason.CAMERA_UNAVAILABLE -> "camera_unavailable"
            else -> "unknown"
        }
        onTrackingStateChange(mapOf("state" to "limited", "reason" to reasonStr))
    }

    // --- Tap to place ---

    fun handleTapToPlace(event: MotionEvent) {
        if (pendingModelConfigs.isEmpty() || currentPendingIndex >= pendingModelConfigs.size) return
        val frame = currentFrame ?: return

        val hitResults = frame.hitTest(event.x, event.y)
        val validHit = hitResults.firstOrNull { hit ->
            val trackable = hit.trackable
            trackable is Plane && trackable.isPoseInPolygon(hit.hitPose) &&
                trackable.trackingState == ARTrackingState.TRACKING
        } ?: return

        val anchor = try {
            validHit.createAnchor()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create anchor", e)
            onARError(mapOf(
                "code" to "ANCHOR_CREATE_FAILED",
                "message" to (e.message ?: "Failed to create anchor")
            ))
            return
        }
        val modelConfig = pendingModelConfigs[currentPendingIndex]
        currentPendingIndex++

        loadAndPlaceModel(anchor, modelConfig)
    }

    private fun loadAndPlaceModel(anchor: com.google.ar.core.Anchor, config: ModelConfig) {
        val anchorNode = AnchorNode(arSceneView.engine, anchor)
        val modelId = config.id.ifEmpty { config.sourceUri.hashCode().toString() }

        scope.launch {
            try {
                val modelInstance = arSceneView.modelLoader.loadModelInstance(config.sourceUri)

                if (modelInstance != null) {
                    val modelNode = ModelNode(
                        modelInstance = modelInstance,
                        scaleToUnits = config.scale
                    ).apply {
                        // Scale handled by our own ScaleGestureDetector with dampening
                        isEditable = config.gestureRotate
                        isScaleEditable = false
                        isRotationEditable = config.gestureRotate
                        if (config.rotation.any { it != 0f }) {
                            rotation = dev.romainguy.kotlin.math.Float3(
                                config.rotation[0],
                                config.rotation[1],
                                config.rotation[2]
                            )
                        }
                    }

                    nodeConfigMap[modelNode] = config
                    activeScaleNode = modelNode
                    anchorNode.addChildNode(modelNode)
                    arSceneView.addChildNode(anchorNode)
                    placedAnchors.add(anchorNode)

                    // Hide plane dots once a model is placed
                    arSceneView.planeRenderer.isEnabled = false

                    onModelLoaded(mapOf("modelId" to modelId))
                    onModelPlaced(mapOf(
                        "modelId" to modelId,
                        "anchorId" to anchor.hashCode().toString()
                    ))
                } else {
                    onModelError(mapOf(
                        "modelId" to modelId,
                        "code" to "MODEL_LOAD_FAILED",
                        "message" to "Failed to load model from ${config.sourceUri}"
                    ))
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load model", e)
                onModelError(mapOf(
                    "modelId" to modelId,
                    "code" to "MODEL_LOAD_FAILED",
                    "message" to (e.message ?: "Unknown error loading model")
                ))
            }
        }
    }

    private fun cleanupAnchorNodeConfigs(anchorNode: AnchorNode) {
        for (child in anchorNode.childNodes) {
            (child as? ModelNode)?.let { nodeConfigMap.remove(it) }
        }
    }

    // --- Scene stack management ---

    fun setModels(models: List<ModelConfig>) {
        pendingModelConfigs = models.toMutableList()
        currentPendingIndex = 0
        currentModels = models.toMutableList()
        // Re-enable plane renderer so user can see surfaces to tap
        if (models.isNotEmpty()) {
            arSceneView.planeRenderer.isEnabled = true
        }
    }

    fun pushScene(models: List<ModelConfig>) {
        sceneStack.addLast(ARSceneState(
            models = currentModels.toList(),
            anchorNodes = placedAnchors.toList()
        ))

        for (node in placedAnchors) {
            node.isVisible = false
        }

        placedAnchors.clear()
        setModels(models)

        onSceneChange(mapOf("action" to "push", "depth" to sceneStack.size))
    }

    fun popScene(): Boolean {
        if (sceneStack.isEmpty()) return false

        for (node in placedAnchors) {
            cleanupAnchorNodeConfigs(node)
            arSceneView.removeChildNode(node)
            node.destroy()
        }
        placedAnchors.clear()

        val previous = sceneStack.removeLast()
        currentModels = previous.models.toMutableList()
        pendingModelConfigs = mutableListOf()
        currentPendingIndex = 0

        for (node in previous.anchorNodes) {
            node.isVisible = true
            placedAnchors.add(node)
        }

        onSceneChange(mapOf("action" to "pop", "depth" to sceneStack.size))
        return true
    }

    fun replaceScene(models: List<ModelConfig>) {
        for (node in placedAnchors) {
            cleanupAnchorNodeConfigs(node)
            arSceneView.removeChildNode(node)
            node.destroy()
        }
        placedAnchors.clear()
        setModels(models)
        onSceneChange(mapOf("action" to "replace", "depth" to sceneStack.size))
    }

    fun popToTop() {
        if (sceneStack.isEmpty()) return

        for (node in placedAnchors) {
            cleanupAnchorNodeConfigs(node)
            arSceneView.removeChildNode(node)
            node.destroy()
        }
        placedAnchors.clear()

        while (sceneStack.size > 1) {
            val state = sceneStack.removeLast()
            for (node in state.anchorNodes) {
                cleanupAnchorNodeConfigs(node)
                arSceneView.removeChildNode(node)
                node.destroy()
            }
        }

        val first = sceneStack.removeLast()
        currentModels = first.models.toMutableList()
        pendingModelConfigs = mutableListOf()
        currentPendingIndex = 0

        for (node in first.anchorNodes) {
            node.isVisible = true
            placedAnchors.add(node)
        }

        onSceneChange(mapOf("action" to "popToTop", "depth" to 0))
    }
}
