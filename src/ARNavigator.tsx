import * as React from 'react';

import NativeARView from './ReactNativeArView';
import ARModel from './ARModel';
import { ARNavigatorProvider } from './ARNavigatorContext';
import NativeModule from './ReactNativeArViewModule';
import type {
  ARNavigatorProps,
  ARModelProps,
  ARSceneNavigator,
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
    NativeModule.pushScene(modelConfigs).catch((err: Error) => {
      onError?.({ code: 'SCENE_PUSH_FAILED', message: err.message });
    });
  }, [currentScene]);

  return (
    <ARNavigatorProvider navigator={navigator} tracking={tracking}>
      <NativeARView style={style} />
      {sceneElement}
    </ARNavigatorProvider>
  );
}
