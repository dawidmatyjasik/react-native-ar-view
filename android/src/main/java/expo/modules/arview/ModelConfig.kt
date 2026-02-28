package expo.modules.arview

data class ModelConfig(
    val id: String = "",
    val sourceUri: String,
    val placement: String = "tap",
    val scale: Float = 1.0f,
    val rotation: FloatArray = floatArrayOf(0f, 0f, 0f),
    val gestureScale: Boolean = false,
    val gestureRotate: Boolean = false,
    val gestureScaleMin: Float = 0.1f,
    val gestureScaleMax: Float = 10.0f,
    val gestureScaleSensitivity: Float = 1.0f
) {
    companion object {
        fun fromMap(map: Map<String, Any?>): ModelConfig {
            return ModelConfig(
                id = map["id"] as? String ?: "",
                sourceUri = map["sourceUri"] as? String ?: "",
                placement = map["placement"] as? String ?: "tap",
                scale = (map["scale"] as? Number)?.toFloat() ?: 1.0f,
                rotation = (map["rotation"] as? List<*>)?.let { list ->
                    floatArrayOf(
                        (list.getOrNull(0) as? Number)?.toFloat() ?: 0f,
                        (list.getOrNull(1) as? Number)?.toFloat() ?: 0f,
                        (list.getOrNull(2) as? Number)?.toFloat() ?: 0f
                    )
                } ?: floatArrayOf(0f, 0f, 0f),
                gestureScale = map["gestureScale"] as? Boolean ?: false,
                gestureRotate = map["gestureRotate"] as? Boolean ?: false,
                gestureScaleMin = (map["gestureScaleMin"] as? Number)?.toFloat() ?: 0.1f,
                gestureScaleMax = (map["gestureScaleMax"] as? Number)?.toFloat() ?: 10.0f,
                gestureScaleSensitivity = (map["gestureScaleSensitivity"] as? Number)?.toFloat() ?: 1.0f
            )
        }
    }
}
