# ARCore Expo Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the WebView-based scaffold with a working ARCore module that provides a Viro-style scene stack navigator for placing GLB/GLTF models in AR on Android.

**Architecture:** Single native `ARSceneView` (from SceneView 2.3.3) wrapped in an ExpoView. JS components (`ARNavigator`, `ARScene`, `ARModel`) are declarative config objects that describe scene content. A Kotlin-side scene stack manages push/pop/replace by saving and restoring anchor+model state. The Expo Module API bridges commands and events between JS and native.

**Tech Stack:** Expo Modules API (Kotlin DSL), SceneView arsceneview 2.3.3 (Filament + ARCore 1.52.0), TypeScript, React

**Design doc:** `docs/plans/2026-02-28-arcore-expo-module-design.md`

---

## Task 1: Define TypeScript Types

**Files:**
- Rewrite: `src/ReactNativeArView.types.ts`

**Step 1: Replace all types with the AR module type definitions**

```typescript
import type { StyleProp, ViewStyle } from 'react-native';

// --- Model types ---

export type ModelSource =
  | { uri: string }    // remote URL
  | number;            // require('./model.glb') returns a number

export type GestureConfig = {
  scale?: boolean;
  rotate?: boolean;
  scaleRange?: [number, number];
};

export type ARModelProps = {
  source: ModelSource;
  placement?: 'tap';
  scale?: number;
  rotation?: [number, number, number];
  gestures?: GestureConfig;
  onLoaded?: () => void;
  onPlaced?: (anchor: { id: string }) => void;
  onError?: (error: { code: string; message: string }) => void;
};

// --- Scene types ---

export type ARSceneNavigator = {
  push: (config: SceneConfig) => void;
  pop: () => void;
  replace: (config: SceneConfig) => void;
  popToTop: () => void;
};

export type SceneConfig = {
  scene: React.ComponentType<ARSceneProps>;
  passProps?: Record<string, unknown>;
};

export type ARSceneProps = {
  arSceneNavigator: ARSceneNavigator;
  passProps?: Record<string, unknown>;
  children?: React.ReactNode;
};

// --- Navigator types ---

export type TrackingState = 'normal' | 'limited' | 'unavailable';

export type PlaneInfo = {
  id: string;
  type: 'horizontal' | 'vertical';
};

export type ARNavigatorProps = {
  initialScene: SceneConfig;
  style?: StyleProp<ViewStyle>;
  onTrackingStateChange?: (state: TrackingState) => void;
  onPlaneDetected?: (plane: PlaneInfo) => void;
  onError?: (error: { code: string; message: string }) => void;
};

// --- Event payloads (native -> JS) ---

export type TrackingStateChangeEvent = {
  state: TrackingState;
  reason?: string;
};

export type PlaneDetectedEvent = {
  id: string;
  type: 'horizontal' | 'vertical';
};

export type ModelLoadedEvent = {
  modelId: string;
};

export type ModelPlacedEvent = {
  modelId: string;
  anchorId: string;
};

export type ModelErrorEvent = {
  modelId: string;
  code: string;
  message: string;
};

export type SceneChangeEvent = {
  action: 'push' | 'pop' | 'replace' | 'popToTop';
  depth: number;
};

export type ARErrorEvent = {
  code: string;
  message: string;
};

// --- Module events union ---

export type ReactNativeArViewModuleEvents = {
  onTrackingStateChange: (params: TrackingStateChangeEvent) => void;
  onPlaneDetected: (params: PlaneDetectedEvent) => void;
  onModelLoaded: (params: ModelLoadedEvent) => void;
  onModelPlaced: (params: ModelPlacedEvent) => void;
  onModelError: (params: ModelErrorEvent) => void;
  onSceneChange: (params: SceneChangeEvent) => void;
  onARError: (params: ARErrorEvent) => void;
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd /Users/dawidspisak/Documents/projects/personal/mobile/react-native-ar-view && npx tsc --noEmit`
Expected: No errors (or only errors from files we haven't updated yet — that's OK, we'll fix in later tasks)

**Step 3: Commit**

```bash
git add src/ReactNativeArView.types.ts
git commit -m "feat: define TypeScript types for AR module API"
```

---

## Task 2: Implement ARModel Component (JS)

**Files:**
- Create: `src/ARModel.tsx`

**Step 1: Create the ARModel component**

ARModel is a "config component" — it doesn't render native views directly. The ARNavigator reads its props and sends them to the native module. ARModel renders `null`.

```tsx
import * as React from 'react';

import { ARModelProps } from './ReactNativeArView.types';

export default function ARModel(_props: ARModelProps) {
  // ARModel is a declarative config component.
  // It doesn't render anything — ARNavigator reads its props
  // and forwards them to the native module.
  return null;
}

ARModel.displayName = 'ARModel';
```

**Step 2: Commit**

```bash
git add src/ARModel.tsx
git commit -m "feat: add ARModel config component"
```

---

## Task 3: Implement ARScene Component (JS)

**Files:**
- Create: `src/ARScene.tsx`

**Step 1: Create the ARScene component**

ARScene is also a config component. It wraps ARModel children so the navigator can extract model configs.

```tsx
import * as React from 'react';

import { ARSceneProps } from './ReactNativeArView.types';

export default function ARScene({ children }: ARSceneProps) {
  // ARScene is a declarative config component.
  // Its children (ARModel instances) are read by ARNavigator
  // to extract model configurations for the native side.
  // It renders children so React can traverse the tree,
  // but ARModel itself renders null.
  return <>{children}</>;
}

ARScene.displayName = 'ARScene';
```

**Step 2: Commit**

```bash
git add src/ARScene.tsx
git commit -m "feat: add ARScene config component"
```

---

## Task 4: Implement ARNavigator Context and Hooks (JS)

**Files:**
- Create: `src/ARNavigatorContext.tsx`

**Step 1: Create context and hooks**

```tsx
import * as React from 'react';

import type { ARSceneNavigator, TrackingState } from './ReactNativeArView.types';

const ARNavigatorContext = React.createContext<ARSceneNavigator | null>(null);
const ARTrackingContext = React.createContext<TrackingState>('unavailable');

export function ARNavigatorProvider({
  navigator,
  tracking,
  children,
}: {
  navigator: ARSceneNavigator;
  tracking: TrackingState;
  children: React.ReactNode;
}) {
  return (
    <ARNavigatorContext.Provider value={navigator}>
      <ARTrackingContext.Provider value={tracking}>
        {children}
      </ARTrackingContext.Provider>
    </ARNavigatorContext.Provider>
  );
}

export function useARNavigator(): ARSceneNavigator {
  const ctx = React.useContext(ARNavigatorContext);
  if (!ctx) {
    throw new Error('useARNavigator must be used within an ARNavigator');
  }
  return ctx;
}

export function useARTracking(): TrackingState {
  return React.useContext(ARTrackingContext);
}
```

**Step 2: Commit**

```bash
git add src/ARNavigatorContext.tsx
git commit -m "feat: add ARNavigator context and hooks"
```

---

## Task 5: Rewrite the Native Module Bridge (JS)

**Files:**
- Rewrite: `src/ReactNativeArViewModule.ts`

**Step 1: Replace the module bridge with AR-specific functions**

```typescript
import { NativeModule, requireNativeModule } from 'expo';

import { ReactNativeArViewModuleEvents } from './ReactNativeArView.types';

declare class ReactNativeArViewModule extends NativeModule<ReactNativeArViewModuleEvents> {
  pushScene(models: Array<Record<string, unknown>>): Promise<void>;
  popScene(): Promise<void>;
  replaceScene(models: Array<Record<string, unknown>>): Promise<void>;
  popToTop(): Promise<void>;
}

export default requireNativeModule<ReactNativeArViewModule>('ReactNativeArView');
```

**Step 2: Commit**

```bash
git add src/ReactNativeArViewModule.ts
git commit -m "feat: rewrite native module bridge with AR scene stack functions"
```

---

## Task 6: Implement ARNavigator Component (JS)

This is the main orchestrator. It renders the native view, manages the JS-side scene stack, extracts model configs from ARScene/ARModel children, and sends them to the native module.

**Files:**
- Rewrite: `src/ReactNativeArView.tsx` (rename conceptually — this becomes the native view wrapper used by ARNavigator)
- Create: `src/ARNavigator.tsx`

**Step 1: Simplify the native view wrapper**

Rewrite `src/ReactNativeArView.tsx`:

```tsx
import { requireNativeView } from 'expo';
import * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type NativeARViewProps = {
  style?: StyleProp<ViewStyle>;
};

const NativeARView: React.ComponentType<NativeARViewProps> =
  requireNativeView('ReactNativeArView');

export default NativeARView;
```

**Step 2: Create ARNavigator**

Create `src/ARNavigator.tsx`:

```tsx
import * as React from 'react';

import NativeARView from './ReactNativeArView';
import ARModel from './ARModel';
import { ARNavigatorProvider } from './ARNavigatorContext';
import NativeModule from './ReactNativeArViewModule';
import type {
  ARNavigatorProps,
  ARModelProps,
  ARSceneNavigator,
  ModelSource,
  SceneConfig,
  TrackingState,
} from './ReactNativeArView.types';

function extractModelConfigs(
  children: React.ReactNode
): Array<Record<string, unknown>> {
  const configs: Array<Record<string, unknown>> = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    // Check if this is an ARModel
    if (child.type === ARModel || (child.type as any)?.displayName === 'ARModel') {
      const props = child.props as ARModelProps;
      const source = props.source;
      let sourceUri: string;

      if (typeof source === 'number') {
        // Local asset via require() — resolve to asset URI
        // Expo's asset system resolves require() to a number ID
        sourceUri = `asset://${source}`;
      } else {
        sourceUri = source.uri;
      }

      configs.push({
        sourceUri,
        placement: props.placement ?? 'tap',
        scale: props.scale ?? 1.0,
        rotation: props.rotation ?? [0, 0, 0],
        gestureScale: props.gestures?.scale ?? false,
        gestureRotate: props.gestures?.rotate ?? false,
        gestureScaleMin: props.gestures?.scaleRange?.[0] ?? 0.1,
        gestureScaleMax: props.gestures?.scaleRange?.[1] ?? 10.0,
      });
    }

    // Recurse into ARScene or other wrappers that have children
    if ((child.props as any)?.children) {
      configs.push(...extractModelConfigs((child.props as any).children));
    }
  });

  return configs;
}

export default function ARNavigator({
  initialScene,
  style,
  onTrackingStateChange,
  onPlaneDetected,
  onError,
}: ARNavigatorProps) {
  const sceneStackRef = React.useRef<SceneConfig[]>([initialScene]);
  const [currentScene, setCurrentScene] = React.useState<SceneConfig>(initialScene);
  const [tracking, setTracking] = React.useState<TrackingState>('unavailable');

  // Subscribe to native events
  React.useEffect(() => {
    const trackingSub = NativeModule.addListener('onTrackingStateChange', (event) => {
      setTracking(event.state);
      onTrackingStateChange?.(event.state);
    });
    const planeSub = NativeModule.addListener('onPlaneDetected', (event) => {
      onPlaneDetected?.(event);
    });
    const errorSub = NativeModule.addListener('onARError', (event) => {
      onError?.(event);
    });

    return () => {
      trackingSub.remove();
      planeSub.remove();
      errorSub.remove();
    };
  }, [onTrackingStateChange, onPlaneDetected, onError]);

  const navigator = React.useMemo<ARSceneNavigator>(() => ({
    push: (config: SceneConfig) => {
      sceneStackRef.current.push(config);
      setCurrentScene(config);
    },
    pop: () => {
      if (sceneStackRef.current.length <= 1) return;
      sceneStackRef.current.pop();
      const prev = sceneStackRef.current[sceneStackRef.current.length - 1];
      setCurrentScene(prev);
    },
    replace: (config: SceneConfig) => {
      sceneStackRef.current[sceneStackRef.current.length - 1] = config;
      setCurrentScene(config);
    },
    popToTop: () => {
      const first = sceneStackRef.current[0];
      sceneStackRef.current = [first];
      setCurrentScene(first);
    },
  }), []);

  // Render the current scene component
  const SceneComponent = currentScene.scene;
  const sceneElement = (
    <SceneComponent
      arSceneNavigator={navigator}
      passProps={currentScene.passProps}
    />
  );

  // Extract model configs from the rendered scene tree and send to native
  const modelConfigs = extractModelConfigs(
    React.isValidElement(sceneElement)
      ? (sceneElement.props as any)?.children ?? sceneElement
      : sceneElement
  );

  // Send scene config to native whenever scene changes
  React.useEffect(() => {
    // The native side receives model configs and sets up the AR scene
    NativeModule.pushScene(modelConfigs).catch((err: Error) => {
      onError?.({ code: 'SCENE_PUSH_FAILED', message: err.message });
    });
  }, [currentScene]);

  return (
    <ARNavigatorProvider navigator={navigator} tracking={tracking}>
      <NativeARView style={style} />
      {/* Render scene element in a hidden container so React processes it
          and we can extract ARModel configs. The ARModel/ARScene render null. */}
      {sceneElement}
    </ARNavigatorProvider>
  );
}
```

**Step 3: Commit**

```bash
git add src/ReactNativeArView.tsx src/ARNavigator.tsx
git commit -m "feat: implement ARNavigator with scene stack management"
```

---

## Task 7: Update Module Exports (JS)

**Files:**
- Rewrite: `src/index.ts`

**Step 1: Replace exports with the new public API**

```typescript
export { default as ARNavigator } from './ARNavigator';
export { default as ARScene } from './ARScene';
export { default as ARModel } from './ARModel';
export { useARNavigator, useARTracking } from './ARNavigatorContext';
export type {
  ARNavigatorProps,
  ARSceneProps,
  ARModelProps,
  ARSceneNavigator,
  SceneConfig,
  ModelSource,
  GestureConfig,
  TrackingState,
  PlaneInfo,
} from './ReactNativeArView.types';
```

**Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: update public API exports"
```

---

## Task 8: Add Android Dependencies

**Files:**
- Modify: `android/build.gradle`
- Modify: `android/src/main/AndroidManifest.xml`

**Step 1: Add SceneView dependency and camera permissions**

Replace `android/build.gradle`:

```groovy
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'expo.modules.arview'
version = '0.1.0'

android {
  namespace "expo.modules.arview"
  defaultConfig {
    minSdkVersion 24
    versionCode 1
    versionName "0.1.0"
  }
  lintOptions {
    abortOnError false
  }
  compileOptions {
    sourceCompatibility JavaVersion.VERSION_17
    targetCompatibility JavaVersion.VERSION_17
  }
  kotlinOptions {
    jvmTarget = "17"
  }
}

dependencies {
  implementation("io.github.sceneview:arsceneview:2.3.3")
}
```

Replace `android/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.CAMERA" />
  <uses-feature android:name="android.hardware.camera.ar" android:required="true" />
  <application>
    <meta-data android:name="com.google.ar.core" android:value="required" />
  </application>
</manifest>
```

**Step 2: Commit**

```bash
git add android/build.gradle android/src/main/AndroidManifest.xml
git commit -m "feat: add SceneView arsceneview dependency and camera permissions"
```

---

## Task 9: Implement Native Data Classes (Kotlin)

**Files:**
- Create: `android/src/main/java/expo/modules/arview/ModelConfig.kt`
- Create: `android/src/main/java/expo/modules/arview/ARSceneState.kt`

**Step 1: Create ModelConfig**

```kotlin
package expo.modules.arview

data class ModelConfig(
    val sourceUri: String,
    val placement: String = "tap",
    val scale: Float = 1.0f,
    val rotation: FloatArray = floatArrayOf(0f, 0f, 0f),
    val gestureScale: Boolean = false,
    val gestureRotate: Boolean = false,
    val gestureScaleMin: Float = 0.1f,
    val gestureScaleMax: Float = 10.0f
) {
    companion object {
        fun fromMap(map: Map<String, Any?>): ModelConfig {
            return ModelConfig(
                sourceUri = map["sourceUri"] as? String ?: "",
                placement = map["placement"] as? String ?: "tap",
                scale = (map["scale"] as? Number)?.toFloat() ?: 1.0f,
                rotation = (map["rotation"] as? List<*>)?.let { list ->
                    floatArrayOf(
                        (list[0] as? Number)?.toFloat() ?: 0f,
                        (list[1] as? Number)?.toFloat() ?: 0f,
                        (list[2] as? Number)?.toFloat() ?: 0f
                    )
                } ?: floatArrayOf(0f, 0f, 0f),
                gestureScale = map["gestureScale"] as? Boolean ?: false,
                gestureRotate = map["gestureRotate"] as? Boolean ?: false,
                gestureScaleMin = (map["gestureScaleMin"] as? Number)?.toFloat() ?: 0.1f,
                gestureScaleMax = (map["gestureScaleMax"] as? Number)?.toFloat() ?: 10.0f
            )
        }
    }
}
```

**Step 2: Create ARSceneState**

```kotlin
package expo.modules.arview

import io.github.sceneview.ar.node.AnchorNode

data class ARSceneState(
    val models: List<ModelConfig>,
    val anchorNodes: List<AnchorNode>
)
```

**Step 3: Commit**

```bash
git add android/src/main/java/expo/modules/arview/ModelConfig.kt android/src/main/java/expo/modules/arview/ARSceneState.kt
git commit -m "feat: add ModelConfig and ARSceneState native data classes"
```

---

## Task 10: Rewrite Native ExpoView with ARSceneView (Kotlin)

This is the core native component. Replaces the WebView-based placeholder.

**Files:**
- Rewrite: `android/src/main/java/expo/modules/arview/ReactNativeArView.kt`

**Step 1: Replace with ARSceneView implementation**

```kotlin
package expo.modules.arview

import android.content.Context
import android.util.Log
import android.view.MotionEvent
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.TrackingFailureReason
import com.google.ar.core.TrackingState as ARTrackingState
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import io.github.sceneview.ar.ARSceneView
import io.github.sceneview.ar.arcore.createAnchorOrNull
import io.github.sceneview.ar.arcore.isValid
import io.github.sceneview.ar.node.AnchorNode
import io.github.sceneview.gesture.GestureDetector
import io.github.sceneview.node.ModelNode
import io.github.sceneview.node.Node
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class ReactNativeArView(context: Context, appContext: AppContext) :
    ExpoView(context, appContext), LifecycleOwner {

    companion object {
        private const val TAG = "ReactNativeArView"
    }

    // Events
    private val onTrackingStateChange by EventDispatcher()
    private val onPlaneDetected by EventDispatcher()
    private val onModelLoaded by EventDispatcher()
    private val onModelPlaced by EventDispatcher()
    private val onModelError by EventDispatcher()
    private val onSceneChange by EventDispatcher()
    private val onARError by EventDispatcher()

    // Lifecycle
    private val lifecycleRegistry = LifecycleRegistry(this)
    override val lifecycle: Lifecycle get() = lifecycleRegistry

    // Scene management
    private val sceneStack = ArrayDeque<ARSceneState>()
    private var currentModels: MutableList<ModelConfig> = mutableListOf()
    private val placedAnchors: MutableList<AnchorNode> = mutableListOf()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // Pending models waiting for tap-to-place
    private var pendingModelConfigs: MutableList<ModelConfig> = mutableListOf()
    private var currentPendingIndex = 0

    // Tracking
    private var lastTrackingState: String = "unavailable"
    private val detectedPlaneIds = mutableSetOf<String>()

    // AR view
    internal val arSceneView: ARSceneView

    init {
        lifecycleRegistry.currentState = Lifecycle.State.CREATED

        arSceneView = ARSceneView(
            context = context,
            sessionConfiguration = { session, config ->
                config.depthMode = when (session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                    true -> Config.DepthMode.AUTOMATIC
                    else -> Config.DepthMode.DISABLED
                }
                config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR
                config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
            },
            onSessionUpdated = { _, frame ->
                handleFrameUpdate(frame)
            },
            onTrackingFailureChanged = { reason ->
                handleTrackingFailure(reason)
            },
            onGestureListener = GestureDetector.SimpleOnGestureListener().apply {
                // We override onSingleTapConfirmed below
            }
        ).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)

            onGestureListener = object : GestureDetector.SimpleOnGestureListener() {
                override fun onSingleTapConfirmed(e: MotionEvent, node: Node?): Boolean {
                    if (node == null) {
                        handleTapToPlace(e)
                    }
                    return true
                }
            }
        }

        addView(arSceneView)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        lifecycleRegistry.currentState = Lifecycle.State.RESUMED
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
        scope.cancel()
    }

    // --- Frame updates ---

    private var currentFrame: Frame? = null

    private fun handleFrameUpdate(frame: Frame) {
        currentFrame = frame

        // Track tracking state changes
        val camera = frame.camera
        val newState = when (camera.trackingState) {
            ARTrackingState.TRACKING -> "normal"
            ARTrackingState.PAUSED -> "limited"
            ARTrackingState.STOPPED -> "unavailable"
        }
        if (newState != lastTrackingState) {
            lastTrackingState = newState
            onTrackingStateChange(mapOf("state" to newState))
        }

        // Track new planes
        for (plane in frame.getUpdatedTrackables(Plane::class.java)) {
            if (plane.trackingState == ARTrackingState.TRACKING) {
                val planeId = plane.hashCode().toString()
                if (planeId !in detectedPlaneIds) {
                    detectedPlaneIds.add(planeId)
                    val type = when (plane.type) {
                        Plane.Type.HORIZONTAL_UPWARD_FACING -> "horizontal"
                        Plane.Type.HORIZONTAL_DOWNWARD_FACING -> "horizontal"
                        Plane.Type.VERTICAL -> "vertical"
                        else -> "horizontal"
                    }
                    onPlaneDetected(mapOf("id" to planeId, "type" to type))
                }
            }
        }
    }

    private fun handleTrackingFailure(reason: TrackingFailureReason?) {
        if (reason != null) {
            val reasonStr = when (reason) {
                TrackingFailureReason.NONE -> return
                TrackingFailureReason.BAD_STATE -> "bad_state"
                TrackingFailureReason.INSUFFICIENT_LIGHT -> "insufficient_light"
                TrackingFailureReason.EXCESSIVE_MOTION -> "excessive_motion"
                TrackingFailureReason.INSUFFICIENT_FEATURES -> "insufficient_features"
                TrackingFailureReason.CAMERA_UNAVAILABLE -> "camera_unavailable"
            }
            onTrackingStateChange(mapOf("state" to "limited", "reason" to reasonStr))
        }
    }

    // --- Tap to place ---

    private fun handleTapToPlace(event: MotionEvent) {
        if (pendingModelConfigs.isEmpty() || currentPendingIndex >= pendingModelConfigs.size) return
        val frame = currentFrame ?: return

        val hitResults = frame.hitTest(event.x, event.y)
        val validHit = hitResults.firstOrNull { hit ->
            val trackable = hit.trackable
            trackable is Plane && trackable.isPoseInPolygon(hit.hitPose) &&
                trackable.trackingState == ARTrackingState.TRACKING
        } ?: return

        val anchor = validHit.createAnchorOrNull() ?: return
        val modelConfig = pendingModelConfigs[currentPendingIndex]
        currentPendingIndex++

        loadAndPlaceModel(anchor, modelConfig)
    }

    private fun loadAndPlaceModel(anchor: com.google.ar.core.Anchor, config: ModelConfig) {
        val anchorNode = AnchorNode(arSceneView.engine, anchor)
        val modelId = config.sourceUri.hashCode().toString()

        scope.launch {
            try {
                val modelInstance = arSceneView.modelLoader.loadModelInstance(config.sourceUri)

                if (modelInstance != null) {
                    val modelNode = ModelNode(
                        modelInstance = modelInstance,
                        scaleToUnits = config.scale
                    ).apply {
                        isEditable = config.gestureScale || config.gestureRotate
                        isScaleEditable = config.gestureScale
                        isRotationEditable = config.gestureRotate
                        if (config.gestureScale) {
                            editableScaleRange = config.gestureScaleMin..config.gestureScaleMax
                        }
                    }

                    anchorNode.addChildNode(modelNode)
                    arSceneView.addChildNode(anchorNode)
                    placedAnchors.add(anchorNode)

                    onModelLoaded(mapOf("modelId" to modelId))
                    onModelPlaced(mapOf(
                        "modelId" to modelId,
                        "anchorId" to anchor.hashCode().toString()
                    ))
                } else {
                    onModelError(mapOf(
                        "modelId" to modelId,
                        "code" to "MODEL_LOAD_FAILED",
                        "message" to "Failed to load model from ${config.sourceUri}"
                    ))
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load model", e)
                onModelError(mapOf(
                    "modelId" to modelId,
                    "code" to "MODEL_LOAD_FAILED",
                    "message" to (e.message ?: "Unknown error loading model")
                ))
            }
        }
    }

    // --- Scene stack management ---

    fun setModels(models: List<ModelConfig>) {
        pendingModelConfigs = models.toMutableList()
        currentPendingIndex = 0
        currentModels = models.toMutableList()
    }

    fun pushScene(models: List<ModelConfig>) {
        // Save current state
        sceneStack.addLast(ARSceneState(
            models = currentModels.toList(),
            anchorNodes = placedAnchors.toList()
        ))

        // Hide current anchors (don't destroy — we may pop back)
        for (node in placedAnchors) {
            node.isVisible = false
        }

        // Set up new scene
        placedAnchors.clear()
        setModels(models)

        onSceneChange(mapOf(
            "action" to "push",
            "depth" to sceneStack.size
        ))
    }

    fun popScene(): Boolean {
        if (sceneStack.isEmpty()) return false

        // Destroy current scene's anchors
        for (node in placedAnchors) {
            arSceneView.removeChildNode(node)
            node.destroy()
        }
        placedAnchors.clear()

        // Restore previous state
        val previous = sceneStack.removeLast()
        currentModels = previous.models.toMutableList()
        pendingModelConfigs = mutableListOf() // previous anchors already placed
        currentPendingIndex = 0

        // Show restored anchors
        for (node in previous.anchorNodes) {
            node.isVisible = true
            placedAnchors.add(node)
        }

        onSceneChange(mapOf(
            "action" to "pop",
            "depth" to sceneStack.size
        ))

        return true
    }

    fun replaceScene(models: List<ModelConfig>) {
        // Destroy current scene's anchors
        for (node in placedAnchors) {
            arSceneView.removeChildNode(node)
            node.destroy()
        }
        placedAnchors.clear()

        // Set up new scene (don't modify stack)
        setModels(models)

        onSceneChange(mapOf(
            "action" to "replace",
            "depth" to sceneStack.size
        ))
    }

    fun popToTop() {
        if (sceneStack.isEmpty()) return

        // Destroy current anchors
        for (node in placedAnchors) {
            arSceneView.removeChildNode(node)
            node.destroy()
        }
        placedAnchors.clear()

        // Destroy all intermediate states
        while (sceneStack.size > 1) {
            val state = sceneStack.removeLast()
            for (node in state.anchorNodes) {
                arSceneView.removeChildNode(node)
                node.destroy()
            }
        }

        // Restore first scene
        val first = sceneStack.removeLast()
        currentModels = first.models.toMutableList()
        pendingModelConfigs = mutableListOf()
        currentPendingIndex = 0

        for (node in first.anchorNodes) {
            node.isVisible = true
            placedAnchors.add(node)
        }

        onSceneChange(mapOf(
            "action" to "popToTop",
            "depth" to 0
        ))
    }
}
```

**Step 2: Commit**

```bash
git add android/src/main/java/expo/modules/arview/ReactNativeArView.kt
git commit -m "feat: implement ARSceneView-based native view with scene stack"
```

---

## Task 11: Rewrite Native Expo Module Definition (Kotlin)

**Files:**
- Rewrite: `android/src/main/java/expo/modules/arview/ReactNativeArViewModule.kt`

**Step 1: Replace with AR module definition**

```kotlin
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
        }
    }

    private fun getView(): ReactNativeArView? {
        // Find the view instance from the module's app context
        return null // Will need adjustment based on how Expo modules reference views
    }
}
```

> **Note for implementer:** The `getView()` helper needs refinement. Expo Module API may require a different pattern to reference the view from async functions. Check Expo Module API docs for the current pattern to call methods on a view from the module. An alternative is to use a view ref approach — store a weak reference to the view when it's created, or use `Commands` on the view definition instead of `AsyncFunction` on the module.

**Step 2: Commit**

```bash
git add android/src/main/java/expo/modules/arview/ReactNativeArViewModule.kt
git commit -m "feat: rewrite Expo module definition with scene stack functions and events"
```

---

## Task 12: Update Example App

**Files:**
- Rewrite: `example/App.tsx`

**Step 1: Replace with AR demo app**

```tsx
import { ARNavigator, ARScene, ARModel } from 'react-native-ar-view';
import type { ARSceneProps } from 'react-native-ar-view';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

function MainScene({ arSceneNavigator }: ARSceneProps) {
  return (
    <ARScene arSceneNavigator={arSceneNavigator}>
      <ARModel
        source={{ uri: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb' }}
        placement="tap"
        scale={0.5}
        gestures={{ scale: true, rotate: true, scaleRange: [0.2, 2.0] }}
        onLoaded={() => console.log('Model loaded!')}
        onPlaced={(anchor) => console.log('Placed at anchor:', anchor.id)}
        onError={(err) => Alert.alert('Error', err.message)}
      />

      {/* Overlay UI */}
      <View style={styles.overlay}>
        <Text style={styles.hint}>Tap a surface to place the model</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => arSceneNavigator.push({ scene: SecondScene })}
        >
          <Text style={styles.buttonText}>Push Scene 2</Text>
        </TouchableOpacity>
      </View>
    </ARScene>
  );
}

function SecondScene({ arSceneNavigator }: ARSceneProps) {
  return (
    <ARScene arSceneNavigator={arSceneNavigator}>
      <ARModel
        source={{ uri: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Duck/glTF-Binary/Duck.glb' }}
        placement="tap"
        scale={0.3}
        gestures={{ scale: true, rotate: true }}
        onLoaded={() => console.log('Duck loaded!')}
      />

      <View style={styles.overlay}>
        <Text style={styles.hint}>Scene 2 - Tap to place a duck</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => arSceneNavigator.pop()}
        >
          <Text style={styles.buttonText}>Pop back</Text>
        </TouchableOpacity>
      </View>
    </ARScene>
  );
}

export default function App() {
  return (
    <ARNavigator
      initialScene={{ scene: MainScene }}
      style={styles.container}
      onTrackingStateChange={(state) => console.log('Tracking:', state)}
      onPlaneDetected={(plane) => console.log('Plane:', plane.type)}
      onError={(err) => Alert.alert('AR Error', `${err.code}: ${err.message}`)}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hint: {
    color: 'white',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

**Step 2: Commit**

```bash
git add example/App.tsx
git commit -m "feat: update example app with AR scene navigator demo"
```

---

## Task 13: Clean Up Unused Files

**Files:**
- Delete or clear: `src/ReactNativeArViewModule.web.ts`
- Delete or clear: `src/ReactNativeArView.web.tsx`
- Preserve: `ios/` files (leave as stubs — iOS will be added later)

**Step 1: Replace web stubs with AR-not-supported messages**

`src/ReactNativeArViewModule.web.ts`:
```typescript
import { registerWebModule, NativeModule } from 'expo';

import { ReactNativeArViewModuleEvents } from './ReactNativeArView.types';

class ReactNativeArViewModule extends NativeModule<ReactNativeArViewModuleEvents> {
  async pushScene(_models: Array<Record<string, unknown>>): Promise<void> {
    console.warn('ARCore is not supported on web');
  }
  async popScene(): Promise<boolean> {
    console.warn('ARCore is not supported on web');
    return false;
  }
  async replaceScene(_models: Array<Record<string, unknown>>): Promise<void> {
    console.warn('ARCore is not supported on web');
  }
  async popToTop(): Promise<void> {
    console.warn('ARCore is not supported on web');
  }
}

export default registerWebModule(ReactNativeArViewModule, 'ReactNativeArViewModule');
```

`src/ReactNativeArView.web.tsx`:
```tsx
import * as React from 'react';
import { Text, View } from 'react-native';

export default function NativeARView(props: { style?: any }) {
  return (
    <View style={[{ justifyContent: 'center', alignItems: 'center' }, props.style]}>
      <Text>AR is not supported on web</Text>
    </View>
  );
}
```

**Step 2: Commit**

```bash
git add src/ReactNativeArViewModule.web.ts src/ReactNativeArView.web.tsx
git commit -m "feat: update web stubs with AR-not-supported messages"
```

---

## Task 14: Build and Fix Compilation Errors

**Step 1: Run TypeScript compilation**

Run: `cd /Users/dawidspisak/Documents/projects/personal/mobile/react-native-ar-view && npx tsc --noEmit`
Expected: Should compile cleanly. Fix any type errors.

**Step 2: Try building the example Android app**

Run: `cd /Users/dawidspisak/Documents/projects/personal/mobile/react-native-ar-view/example && npx expo run:android`
Expected: Likely will surface Kotlin compilation errors. Fix them iteratively.

Common issues to watch for:
- SceneView API differences from research (method signatures may differ)
- Expo Module API patterns for referencing views from async functions
- Gradle dependency resolution issues
- minSdk conflicts between SceneView and the example app

**Step 3: Fix and commit each issue**

```bash
git add -A
git commit -m "fix: resolve compilation errors from initial integration"
```

---

## Task 15: Manual Testing on Device

**Step 1: Install on physical Android device**

Run: `cd /Users/dawidspisak/Documents/projects/personal/mobile/react-native-ar-view/example && npx expo run:android --device`

**Step 2: Test checklist**

- [ ] App launches without crash
- [ ] Camera permission requested and granted
- [ ] AR session starts (camera feed visible)
- [ ] Planes detected (plane overlay visible)
- [ ] Tap on surface places the DamagedHelmet model
- [ ] Pinch to scale works
- [ ] Twist to rotate works
- [ ] "Push Scene 2" button works — new scene loads
- [ ] Tap places duck model in scene 2
- [ ] "Pop back" returns to scene 1 with helmet still visible

**Step 3: Fix any runtime issues and commit**

```bash
git add -A
git commit -m "fix: resolve runtime issues from device testing"
```

---

## Summary of Tasks

| # | Task | Files touched |
|---|---|---|
| 1 | TypeScript types | `src/ReactNativeArView.types.ts` |
| 2 | ARModel component | `src/ARModel.tsx` (create) |
| 3 | ARScene component | `src/ARScene.tsx` (create) |
| 4 | Context and hooks | `src/ARNavigatorContext.tsx` (create) |
| 5 | Native module bridge | `src/ReactNativeArViewModule.ts` |
| 6 | ARNavigator component | `src/ReactNativeArView.tsx`, `src/ARNavigator.tsx` (create) |
| 7 | Module exports | `src/index.ts` |
| 8 | Android dependencies | `android/build.gradle`, `AndroidManifest.xml` |
| 9 | Native data classes | `ModelConfig.kt`, `ARSceneState.kt` (create) |
| 10 | Native ExpoView | `ReactNativeArView.kt` |
| 11 | Native module def | `ReactNativeArViewModule.kt` |
| 12 | Example app | `example/App.tsx` |
| 13 | Web stubs | `src/*.web.ts(x)` |
| 14 | Build & fix | All files as needed |
| 15 | Device testing | All files as needed |
