package expo.modules.arview

import io.github.sceneview.ar.node.AnchorNode

data class ARSceneState(
    val models: List<ModelConfig>,
    val anchorNodes: List<AnchorNode>
)
