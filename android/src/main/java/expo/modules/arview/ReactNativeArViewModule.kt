package expo.modules.arview

import android.view.MotionEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import io.github.sceneview.node.Node

class ReactNativeArViewModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ReactNativeArView")

        Events(
            "onTrackingStateChange",
            "onPlaneDetected",
            "onModelLoaded",
            "onModelPlaced",
            "onModelError",
            "onSceneChange",
            "onARError"
        )

        AsyncFunction("pushScene") { models: List<Map<String, Any?>> ->
            val configs = models.map { ModelConfig.fromMap(it) }
            getView()?.pushScene(configs)
        }

        AsyncFunction("popScene") {
            getView()?.popScene() ?: false
        }

        AsyncFunction("replaceScene") { models: List<Map<String, Any?>> ->
            val configs = models.map { ModelConfig.fromMap(it) }
            getView()?.replaceScene(configs)
        }

        AsyncFunction("popToTop") {
            getView()?.popToTop()
        }

        View(ReactNativeArView::class) {
            Events(
                "onTrackingStateChange",
                "onPlaneDetected",
                "onModelLoaded",
                "onModelPlaced",
                "onModelError",
                "onSceneChange",
                "onARError"
            )

            OnViewDidUpdateProps { view: ReactNativeArView ->
                // Set up tap gesture handling when the view is ready
                view.arSceneView.onGestureListener =
                    object : io.github.sceneview.gesture.GestureDetector.SimpleOnGestureListener() {
                        override fun onSingleTapConfirmed(e: MotionEvent, node: Node?): Boolean {
                            if (node == null) {
                                view.handleTapToPlace(e)
                            }
                            return true
                        }
                    }
            }
        }
    }

    private fun getView(): ReactNativeArView? {
        return ReactNativeArView.currentInstance?.get()
    }
}
