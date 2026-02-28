import ExpoModulesCore

public class ReactNativeArViewModule: Module {
    public func definition() -> ModuleDefinition {
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

        AsyncFunction("pushScene") { (models: [[String: Any]]) in
            let configs = models.map { ModelConfig.from($0) }
            await withCheckedContinuation { continuation in
                DispatchQueue.main.async {
                    Self.getView()?.pushScene(configs)
                    continuation.resume()
                }
            }
        }

        AsyncFunction("popScene") { () -> Bool in
            return await withCheckedContinuation { continuation in
                DispatchQueue.main.async {
                    let result = Self.getView()?.popScene() ?? false
                    continuation.resume(returning: result)
                }
            }
        }

        AsyncFunction("replaceScene") { (models: [[String: Any]]) in
            let configs = models.map { ModelConfig.from($0) }
            await withCheckedContinuation { continuation in
                DispatchQueue.main.async {
                    Self.getView()?.replaceScene(configs)
                    continuation.resume()
                }
            }
        }

        AsyncFunction("popToTop") { () in
            await withCheckedContinuation { continuation in
                DispatchQueue.main.async {
                    Self.getView()?.popToTop()
                    continuation.resume()
                }
            }
        }

        View(ReactNativeArView.self) {
            Events(
                "onTrackingStateChange",
                "onPlaneDetected",
                "onModelLoaded",
                "onModelPlaced",
                "onModelError",
                "onSceneChange",
                "onARError"
            )
        }
    }

    private static func getView() -> ReactNativeArView? {
        return ReactNativeArView.currentInstance
    }
}
