# iOS ARKit Implementation Design

**Date:** 2026-02-28
**Status:** Approved
**Scope:** Full feature parity with Android ARCore implementation

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| AR Framework | SceneKit + ARKit | Zero external deps, native Apple ecosystem, best documented |
| Model Loading | GLTFKit2 (~> 0.5) | GLB/GLTF → SceneKit nodes, same model files cross-platform |
| Architecture | Mirror Android structure | 4 files, same responsibilities, easy cross-platform maintenance |
| Feature Scope | Full parity | All 7 events, scene stack, gestures, plane detection |

## File Structure

```
ios/
├── ReactNativeArViewModule.swift   # Expo module: events + async functions
├── ReactNativeArView.swift         # ARSCNView host, lifecycle, gestures, scene stack
├── ModelConfig.swift               # Model configuration struct
├── ARSceneState.swift              # Scene state snapshot for stack
└── ReactNativeArView.podspec       # Updated with GLTFKit2 dependency
```

## Dependencies

- **GLTFKit2** (~> 0.5) — GLB/GLTF loading into SceneKit nodes
- **ARKit** (system framework)
- **SceneKit** (system framework)
- **ExpoModulesCore** (existing dependency)
- iOS deployment target: 15.1 (unchanged)

## Module Interface (ReactNativeArViewModule.swift)

Identical to Android:

**Events (7):**
- `onTrackingStateChange` — tracking state updates
- `onPlaneDetected` — new plane detected
- `onModelLoaded` — model finished loading
- `onModelPlaced` — model placed on anchor
- `onModelError` — model loading/placement failed
- `onSceneChange` — scene stack navigation occurred
- `onARError` — AR session error

**AsyncFunctions (4):**
- `pushScene(models: [[String: Any]])` — push new scene with models
- `popScene()` — pop to previous scene
- `replaceScene(models: [[String: Any]])` — replace current scene models
- `popToTop()` — pop to initial scene

**View:** Registers `ReactNativeArView` as native view, echoes all events.

## View Implementation (ReactNativeArView.swift)

### Lifecycle
- `ExpoView` subclass containing `ARSCNView`
- Session started on first `layoutSubviews()` with `ARWorldTrackingConfiguration`:
  - `planeDetection = [.horizontal, .vertical]`
  - `environmentTexturing = .automatic` (matches Android ENVIRONMENTAL_HDR)
  - `frameSemantics = .sceneDepth` if LiDAR available (matches Android depth mode)
- Session paused on `removeFromSuperview()`
- Implements `ARSCNViewDelegate` + `ARSessionDelegate`

### Plane Visualization
- `renderer(_:didAdd:for:)` — renders translucent grid on detected planes
- `renderer(_:didUpdate:for:)` — updates plane extent
- Plane overlays removed after first model placement (matches Android)

### Tap-to-Place
- `UITapGestureRecognizer` on ARSCNView
- Raycast query → session raycast → create `ARAnchor` on tracked plane
- Only places when tracking state is `.normal`

### Model Loading (async)
```swift
func loadAndPlaceModel(anchor: ARAnchor, config: ModelConfig) async {
    // GLTFKit2: load GLB/GLTF → SCNScene → SCNNode
    // Apply scale & rotation from config
    // Attach to anchor node
    // Fire onModelLoaded + onModelPlaced events
    // On error: fire onModelError
}
```

### Gesture Handling
- `UIPinchGestureRecognizer` for scale
  - Dampening formula: `1 + (rawScale - 1) * sensitivity` (matches Android)
  - Clamped to `[gestureScaleMin, gestureScaleMax]`
- `UIRotationGestureRecognizer` for rotation (Y axis)
- Hit test on gesture start to identify target model node
- Per-model gesture settings via `modelNode → ModelConfig` mapping

### Scene Stack
```
sceneStack: [ARSceneState]     — saved scene snapshots
currentModels: [ModelConfig]   — active scene models
placedAnchors: [AnchorNode]    — active anchors + nodes

pushScene:   save → hide current → load new
popScene:    destroy current → restore previous → show
replaceScene: destroy current → load new (no stack change)
popToTop:    destroy all intermediate → restore initial
```

### Tracking State
- `session(_:cameraDidChangeTrackingState:)` delegate
- Maps: `.normal` → "normal", `.limited(_)` → "limited", `.notAvailable` → "unavailable"
- Sends `onTrackingStateChange` on transitions

### Plane Detection
- `renderer(_:didAdd:for:)` detects new `ARPlaneAnchor`
- Classifies by `.alignment`: `.horizontal` / `.vertical`
- Deduplicates by tracking seen plane identifiers

## Data Models

### ModelConfig.swift
```swift
struct ModelConfig {
    let id: String
    let sourceUri: String           // "asset://123" or "https://..."
    let placement: String           // "tap"
    let scale: Float                // uniform scale (default 1.0)
    let rotation: [Float]           // euler [x, y, z] (default [0,0,0])
    let gestureScale: Bool          // pinch enabled (default false)
    let gestureRotate: Bool         // rotate enabled (default false)
    let gestureScaleMin: Float      // min scale (default 0.1)
    let gestureScaleMax: Float      // max scale (default 10.0)
    let gestureScaleSensitivity: Float // dampening (default 1.0)

    var sourceURL: URL?             // resolved from sourceUri
    static func from(_ dict: [String: Any]) -> ModelConfig
}
```

### ARSceneState.swift
```swift
struct ARSceneState {
    let models: [ModelConfig]
    let anchorNodes: [AnchorNode]   // (anchor: ARAnchor, node: SCNNode)
}
```

## Asset Resolution

- `"asset://123"` → Expo asset ID → local file path
- `"https://..."` → Download to temp directory → local URL
- GLTFKit2 loads from local `URL` in both cases

## Podspec Changes

```ruby
s.dependency 'GLTFKit2', '~> 0.5'
s.frameworks = 'ARKit', 'SceneKit'
```

## JS Layer Changes

**None.** The TypeScript bridge, events, and components are already platform-agnostic.
The same example app works on both iOS and Android with identical model URLs.

## Android ↔ iOS Mapping

| Android (Kotlin) | iOS (Swift) | Notes |
|-------------------|-------------|-------|
| `ARSceneView` (SceneView 2.3.3) | `ARSCNView` (SceneKit) | Different rendering engines, same API surface |
| `modelLoader.loadModelInstance()` | `GLTFAsset.load()` + `SCNScene.from(gltf:)` | GLTFKit2 bridges the gap |
| `AndroidScaleDetector` | `UIPinchGestureRecognizer` | Same dampening formula |
| `Frame.getUpdatedTrackables(Plane)` | `renderer(_:didAdd:for:)` delegate | Different detection APIs, same events |
| `LifecycleOwner` + `LifecycleRegistry` | `layoutSubviews()` + `removeFromSuperview()` | Platform lifecycle patterns |
| `scope.launch` (coroutines) | `Task { await ... }` (Swift concurrency) | Async model loading |
