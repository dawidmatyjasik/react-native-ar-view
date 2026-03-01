package expo.modules.arview

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import android.os.Handler
import android.os.Looper

class ReactNativeArViewModule : Module() {
    private val uiHandler = Handler(Looper.getMainLooper())

    private fun runOnUi(promise: Promise, block: () -> Any?) {
        uiHandler.post {
            try {
                promise.resolve(block())
            } catch (e: Exception) {
                promise.reject("ERR_UI_THREAD", e.message, e)
            }
        }
    }

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

        AsyncFunction("pushScene") { models: List<Map<String, Any?>>, promise: Promise ->
            val configs = models.map { ModelConfig.fromMap(it) }
            runOnUi(promise) { getView()?.pushScene(configs) }
        }

        AsyncFunction("popScene") { promise: Promise ->
            runOnUi(promise) { getView()?.popScene() ?: false }
        }

        AsyncFunction("replaceScene") { models: List<Map<String, Any?>>, promise: Promise ->
            val configs = models.map { ModelConfig.fromMap(it) }
            runOnUi(promise) { getView()?.replaceScene(configs) }
        }

        AsyncFunction("popToTop") { promise: Promise ->
            runOnUi(promise) { getView()?.popToTop() }
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

            Prop("planeDetection") { view: ReactNativeArView, value: String? ->
                view.setPlaneDetection(value ?: "horizontal_and_vertical")
            }

            // Gesture listener is set up once in ReactNativeArView init block
        }
    }

    private fun getView(): ReactNativeArView? {
        return ReactNativeArView.currentInstance?.get()
    }
}
