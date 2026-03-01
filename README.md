# react-native-ar-view

AR view component for React Native and Expo. Place, scale, rotate, and drag 3D models on real-world surfaces using ARKit (iOS) and ARCore (Android).

- Load `.glb`/`.gltf` models from URLs or bundled assets
- Tap-to-place on detected planes
- Pinch to scale, rotate, and pan to drag placed models
- Scene stack navigation (push, pop, replace) for multi-step AR flows
- Configurable plane detection (horizontal, vertical, or both)
- TypeScript-first API

## Requirements

| Platform | Minimum | AR Framework |
| -------- | ------- | ------------ |
| iOS      | 15.0+   | ARKit        |
| Android  | API 24+ | ARCore       |
| Expo     | SDK 52+ | -            |

**Physical device required** - AR does not work in simulators or emulators.

## Installation

```sh
npx expo install react-native-ar-view
```

### iOS Setup

Add camera permission and ARKit capability to your `app.json`:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "This app uses the camera for augmented reality."
      }
    },
    "plugins": [
      [
        "expo-build-properties",
        {
          "ios": {
            "entitlements": {
              "com.apple.developer.arkit": true
            }
          }
        }
      ]
    ]
  }
}
```

### Android Setup

ARCore is included automatically. No additional configuration needed.

## Quick Start

```tsx
import { ARNavigator, ARModel } from "react-native-ar-view";
import { StyleSheet, Text, View } from "react-native";

function MyScene() {
  return (
    <>
      <ARModel
        source={{ uri: "https://example.com/model.glb" }}
        placement="tap"
        scale={0.5}
        gestures={{ scale: true, rotate: true }}
      />
      <View style={styles.overlay}>
        <Text style={styles.hint}>Tap a surface to place the model</Text>
      </View>
    </>
  );
}

export default function App() {
  return (
    <ARNavigator
      initialScene={{ scene: MyScene }}
      style={{ flex: 1 }}
      planeDetection="horizontal"
    />
  );
}
```

## API Reference

### `<ARNavigator>`

The root component that manages the AR session, camera view, and scene stack.

```tsx
<ARNavigator
  initialScene={{ scene: MyScene }}
  style={{ flex: 1 }}
  planeDetection="horizontal"
  onTrackingStateChange={(state) => console.log(state)}
  onPlaneDetected={(plane) => console.log(plane.type)}
  onError={(err) => console.error(err.code, err.message)}
/>
```

| Prop                    | Type                                                      | Default                     | Description                            |
| ----------------------- | --------------------------------------------------------- | --------------------------- | -------------------------------------- |
| `initialScene`          | `SceneConfig`                                             | _required_                  | The first scene to render              |
| `style`                 | `ViewStyle`                                               | -                           | Style applied to the AR view container |
| `planeDetection`        | `'horizontal' \| 'vertical' \| 'horizontal_and_vertical'` | `'horizontal_and_vertical'` | Which plane types to detect            |
| `onTrackingStateChange` | `(state: TrackingState) => void`                          | -                           | Called when AR tracking state changes  |
| `onPlaneDetected`       | `(plane: PlaneInfo) => void`                              | -                           | Called when a new plane is detected    |
| `onError`               | `(error: { code, message }) => void`                      | -                           | Called on AR errors                    |

### `<ARModel>`

Declares a 3D model to be placed in the AR scene. Must be rendered inside a scene component.

```tsx
<ARModel
  source={{ uri: "https://example.com/model.glb" }}
  placement="tap"
  scale={0.5}
  rotation={[0, Math.PI / 4, 0]}
  gestures={{
    scale: true,
    rotate: true,
    scaleRange: [0.1, 3.0],
    scaleSensitivity: 0.3,
  }}
/>
```

| Prop        | Type              | Default     | Description                                |
| ----------- | ----------------- | ----------- | ------------------------------------------ |
| `source`    | `{ uri: string }` | _required_  | URL to a `.glb` or `.gltf` model           |
| `placement` | `'tap'`           | `'tap'`     | Placement strategy                         |
| `scale`     | `number`          | `1.0`       | Initial model scale                        |
| `rotation`  | `[x, y, z]`       | `[0, 0, 0]` | Initial rotation in radians (euler angles) |
| `gestures`  | `GestureConfig`   | -           | Enable interactive gestures                |

#### `GestureConfig`

| Property           | Type         | Default       | Description                |
| ------------------ | ------------ | ------------- | -------------------------- |
| `scale`            | `boolean`    | `false`       | Enable pinch-to-scale      |
| `rotate`           | `boolean`    | `false`       | Enable two-finger rotation |
| `scaleRange`       | `[min, max]` | `[0.1, 10.0]` | Min/max scale bounds       |
| `scaleSensitivity` | `number`     | `1.0`         | Dampens pinch speed (0–1)  |

### Scene Navigation

Use the `useARNavigator` hook inside any scene component to navigate between AR scenes. Each scene can define its own set of models and UI.

```tsx
import { useARNavigator } from "react-native-ar-view";

function MyScene() {
  const navigator = useARNavigator();

  return (
    <>
      <ARModel source={{ uri: "..." }} placement="tap" />
      <Button
        title="Next"
        onPress={() => navigator.push({ scene: NextScene })}
      />
    </>
  );
}
```

| Method            | Description                                                               |
| ----------------- | ------------------------------------------------------------------------- |
| `push(config)`    | Push a new scene onto the stack. Current models are preserved and hidden. |
| `pop()`           | Pop the current scene and restore the previous one.                       |
| `replace(config)` | Replace the current scene (destroys current models).                      |
| `popToTop()`      | Pop all scenes back to the first one.                                     |

#### Passing Props Between Scenes

```tsx
// Push with props
navigator.push({
  scene: DetailScene,
  passProps: { modelScale: 0.3, label: "Small model" },
});

// Read props in the target scene
import { useSceneProps } from "react-native-ar-view";

function DetailScene() {
  const { modelScale, label } = useSceneProps({ modelScale: 1, label: "" });
  return <ARModel source={{ uri: "..." }} scale={modelScale} />;
}
```

### Hooks

| Hook                 | Returns            | Description                                                          |
| -------------------- | ------------------ | -------------------------------------------------------------------- |
| `useARNavigator()`   | `ARSceneNavigator` | Scene stack navigation methods                                       |
| `useARTracking()`    | `TrackingState`    | Current AR tracking state (`'normal'`, `'limited'`, `'unavailable'`) |
| `useSceneProps<T>()` | `T \| undefined`   | Props passed via `navigator.push({ passProps })`                     |

## Interactions

After placing a model, tap it to select it. Once selected:

- **Pinch** with two fingers to scale (when `gestures.scale` is enabled)
- **Rotate** with two fingers to rotate around the Y axis (when `gestures.rotate` is enabled)
- **Pan** with one finger to drag the model across detected surfaces

Plane indicators are shown before model placement and hidden after the first model is placed.

## Model Sources

| Source        | Example                                             |
| ------------- | --------------------------------------------------- |
| Remote URL    | `source={{ uri: 'https://example.com/model.glb' }}` |
| Bundled asset | `source={{ uri: 'asset://model.glb' }}`             |

Supported formats: `.glb`, `.gltf` (loaded via [GLTFKit2](https://github.com/nicklockwood/GLTFKit2) on iOS, [SceneView](https://github.com/SceneView/sceneview-android) on Android).

## License

MIT
