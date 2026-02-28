# ARCore Expo Module Design

## Summary

An Expo module (`react-native-ar-view`) that wraps ARCore via SceneView for Android, providing a Viro-inspired scene stack navigator API for placing and interacting with 3D GLB/GLTF models in augmented reality.

**Scope**: Android only (ARCore). iOS (ARKit) planned for the future.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Model format | GLB/GLTF only | Native to ARCore/Filament, compact, handles materials |
| Model sources | Remote URLs + local assets | Covers both development and production use cases |
| Placement | Tap-to-place on detected surfaces | Most intuitive AR UX pattern |
| Gestures | Pinch-to-scale + rotate | Built into SceneView's Node system |
| Animations | Not in scope (static models) | Added later as needed |
| AR engine | SceneView arsceneview 2.3.3 | Maintained fork of Sceneform, Kotlin-first, built on Filament + ARCore 1.52.0 |
| API pattern | Scene stack navigator (Viro-style) | Familiar to Viro users, clean scene isolation |

## Architecture

```
┌─────────────────────────────────────────────┐
│  JS Layer (TypeScript)                      │
│  ARNavigator → ARScene → ARModel            │
│  Imperative: push / pop / replace           │
├─────────────────────────────────────────────┤
│  Bridge Layer (Expo Module API)             │
│  Native View (ARSceneView)                  │
│  Native Module (scene stack commands)       │
├─────────────────────────────────────────────┤
│  Native Layer (Kotlin / Android)            │
│  SceneView arsceneview 2.3.3               │
│  ARCore 1.52.0 + Filament                  │
└─────────────────────────────────────────────┘
```

Single native `ARSceneView` instance. Scene stack managed in Kotlin. JS components (`ARScene`, `ARModel`) are declarative config objects — the `ARNavigator` reads them and sends structured data to the native module.

## JS API

### ARNavigator

Top-level component. Renders the native AR view.

```tsx
<ARNavigator
  initialScene={{ scene: MyARScene, passProps: { color: 'red' } }}
  style={{ flex: 1 }}
  onTrackingStateChange={(state: 'normal' | 'limited' | 'unavailable') => {}}
  onPlaneDetected={(plane: { id: string; type: 'horizontal' | 'vertical' }) => {}}
  onError={(error: { code: string; message: string }) => {}}
/>
```

### ARScene

Returned by scene components. Container for models.

```tsx
function MyARScene({ arSceneNavigator, passProps }) {
  return (
    <ARScene>
      <ARModel
        source={{ uri: 'https://example.com/sofa.glb' }}
        placement="tap"
        scale={0.5}
        gestures={{ scale: true, rotate: true, scaleRange: [0.2, 2.0] }}
        onLoaded={() => {}}
        onPlaced={(anchor) => {}}
        onError={(error) => {}}
      />
    </ARScene>
  );
}
```

### ARModel

A 3D model in the scene.

```tsx
<ARModel
  source={{ uri: 'https://example.com/model.glb' }}
  // OR source={require('./assets/model.glb')}
  placement="tap"            // tap-to-place on detected surface
  scale={0.5}                // uniform scale (meters)
  rotation={[0, 45, 0]}     // euler angles [x, y, z] in degrees
  gestures={{
    scale: true,
    rotate: true,
    scaleRange: [0.2, 2.0],
  }}
  onLoaded={() => {}}
  onPlaced={(anchor: { id: string }) => {}}
  onError={(error: { code: string; message: string }) => {}}
/>
```

### Imperative Navigation

Passed as `arSceneNavigator` prop to every scene component:

```tsx
arSceneNavigator.push({ scene: NextScene, passProps: { id: 42 } });
arSceneNavigator.pop();
arSceneNavigator.replace({ scene: OtherScene });
arSceneNavigator.popToTop();
```

### Hooks

```tsx
const navigator = useARNavigator();    // access navigator from any child component
const tracking = useARTracking();       // 'normal' | 'limited' | 'unavailable'
```

## Native Android Implementation

### Dependencies

```groovy
// android/build.gradle
dependencies {
    implementation("io.github.sceneview:arsceneview:2.3.3")
}
```

AndroidManifest.xml:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera.ar" android:required="true" />
<meta-data android:name="com.google.ar.core" android:value="required" />
```

### Classes

| Class | Role |
|---|---|
| `ReactNativeArViewModule.kt` | Expo Module. Exposes push/pop/replace/popToTop as async functions. Defines events. |
| `ReactNativeArView.kt` | ExpoView subclass. Hosts ARSceneView. Manages scene stack. Handles model loading, placement, gestures. |
| `ARSceneState.kt` | Data class for saved scene state (anchor nodes + model configs). |
| `ModelConfig.kt` | Data class for model configuration (source, scale, rotation, gestures). Mapped from JS props. |

### Scene Stack

```kotlin
class ReactNativeArView : ExpoView {
    private val arSceneView: ARSceneView
    private val sceneStack: ArrayDeque<ARSceneState> = ArrayDeque()

    fun pushScene(sceneConfig: Map<String, Any>) {
        // Save current scene state
        sceneStack.addLast(captureCurrentState())
        // Clear current scene
        clearScene()
        // Load new scene
        loadModels(sceneConfig)
    }

    fun popScene() {
        if (sceneStack.isEmpty()) return
        clearScene()
        restoreState(sceneStack.removeLast())
    }
}
```

### Model Loading & Placement Flow

1. JS sends model config (URL, scale, gestures) via props
2. Native stores as `ModelConfig`
3. ARCore detects planes, native enables tap-to-place
4. User tap → hit test → `AnchorNode` → `modelLoader.loadModelInstance()` → `ModelNode` → attach to anchor
5. Events sent to JS: `onModelLoaded`, `onModelPlaced`, `onModelError`

## Events

| Event | Payload | Trigger |
|---|---|---|
| `onTrackingStateChange` | `{ state, reason? }` | AR tracking quality changes |
| `onPlaneDetected` | `{ id, type }` | New plane detected |
| `onModelLoaded` | `{ modelId }` | GLB finished loading |
| `onModelPlaced` | `{ modelId, anchorId }` | Model placed on surface |
| `onModelError` | `{ modelId, code, message }` | Model failed to load |
| `onSceneChange` | `{ action, depth }` | Scene stack changed |
| `onARError` | `{ code, message }` | ARCore session errors |

## Error Codes

| Code | Meaning |
|---|---|
| `ARCORE_NOT_SUPPORTED` | Device doesn't support ARCore |
| `ARCORE_NOT_INSTALLED` | ARCore needs install/update |
| `CAMERA_PERMISSION_DENIED` | Camera permission not granted |
| `MODEL_LOAD_FAILED` | GLB download/parse failed |
| `SCENE_STACK_EMPTY` | pop() with empty stack |

## Testing

- **JS unit tests**: Scene stack logic, component prop validation, hook behavior (Jest + RNTL)
- **Example app**: Multi-scene demo with tap-to-place, gestures, navigation
- **Manual testing**: Real device required (ARCore not supported on emulator)
