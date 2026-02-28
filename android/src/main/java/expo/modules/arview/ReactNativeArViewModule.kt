package expo.modules.arview

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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

            // Gesture listener is set up once in ReactNativeArView init block
        }
    }

    private fun getView(): ReactNativeArView? {
        return ReactNativeArView.currentInstance?.get()
    }
}
