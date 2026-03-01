import Foundation

struct ModelConfig {
    let id: String
    let sourceUri: String
    let placement: String
    let scale: Float
    let rotation: [Float]
    let gestureScale: Bool
    let gestureRotate: Bool
    let gestureScaleMin: Float
    let gestureScaleMax: Float
    let gestureScaleSensitivity: Float

    static func from(_ dict: [String: Any]) -> ModelConfig {
        let rotation: [Float]
        if let rotList = dict["rotation"] as? [Any] {
            rotation = [
                (rotList[safe: 0] as? NSNumber)?.floatValue ?? 0,
                (rotList[safe: 1] as? NSNumber)?.floatValue ?? 0,
                (rotList[safe: 2] as? NSNumber)?.floatValue ?? 0
            ]
        } else {
            rotation = [0, 0, 0]
        }

        return ModelConfig(
            id: dict["id"] as? String ?? "",
            sourceUri: dict["sourceUri"] as? String ?? "",
            placement: dict["placement"] as? String ?? "tap",
            scale: (dict["scale"] as? NSNumber)?.floatValue ?? 1.0,
            rotation: rotation,
            gestureScale: dict["gestureScale"] as? Bool ?? false,
            gestureRotate: dict["gestureRotate"] as? Bool ?? false,
            gestureScaleMin: (dict["gestureScaleMin"] as? NSNumber)?.floatValue ?? 0.1,
            gestureScaleMax: (dict["gestureScaleMax"] as? NSNumber)?.floatValue ?? 10.0,
            gestureScaleSensitivity: (dict["gestureScaleSensitivity"] as? NSNumber)?.floatValue ?? 1.0
        )
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
