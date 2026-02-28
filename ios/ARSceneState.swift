import ARKit
import SceneKit

struct AnchorNodePair {
    let anchor: ARAnchor
    let node: SCNNode
}

struct ARSceneState {
    let models: [ModelConfig]
    let anchorNodes: [AnchorNodePair]
}
