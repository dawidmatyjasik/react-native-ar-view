import * as React from 'react';

import NativeARView from './ReactNativeArView';
import { ARNavigatorProvider } from './ARNavigatorContext';
import { ARSceneProvider, ModelRegistration } from './ARSceneContext';
import NativeModule from './ReactNativeArViewModule';
import type {
  ARNavigatorProps,
  ARSceneNavigator,
  SceneChangeEvent,
  SceneConfig,
  TrackingState,
} from './ReactNativeArView.types';

type NavigationAction = SceneChangeEvent['action'];

export default function ARNavigator({
  initialScene,
  style,
  onTrackingStateChange,
  onPlaneDetected,
  onError,
}: ARNavigatorProps) {
  const sceneStackRef = React.useRef<SceneConfig[]>([initialScene]);
  const [currentScene, setCurrentScene] = React.useState<SceneConfig>(initialScene);
  const [sceneKey, setSceneKey] = React.useState(0);
  const [tracking, setTracking] = React.useState<TrackingState>('unavailable');
  const lastActionRef = React.useRef<NavigationAction>('push');
  const pendingModelsRef = React.useRef<ModelRegistration[]>([]);

  // Store callbacks in refs so subscriptions are stable (C1+C2)
  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;
  const onTrackingRef = React.useRef(onTrackingStateChange);
  onTrackingRef.current = onTrackingStateChange;
  const onPlaneRef = React.useRef(onPlaneDetected);
  onPlaneRef.current = onPlaneDetected;

  // Subscribe to native events
  React.useEffect(() => {
    const trackingSub = NativeModule.addListener('onTrackingStateChange', (event) => {
      setTracking(event.state);
      onTrackingRef.current?.(event.state);
    });
    const planeSub = NativeModule.addListener('onPlaneDetected', (event) => {
      onPlaneRef.current?.(event);
    });
    const errorSub = NativeModule.addListener('onARError', (event) => {
      onErrorRef.current?.(event);
    });

    return () => {
      trackingSub.remove();
      planeSub.remove();
      errorSub.remove();
    };
  }, []);

  const sendModelsToNative = React.useCallback((models: ModelRegistration[]) => {
    const action = lastActionRef.current;

    switch (action) {
      case 'push': {
        const configs = models.map((m) => ({ ...m } as Record<string, unknown>));
        NativeModule.pushScene(configs).catch((err: Error) => {
          onErrorRef.current?.({ code: 'SCENE_PUSH_FAILED', message: err.message });
        });
        break;
      }
      case 'pop':
        NativeModule.popScene().catch((err: Error) => {
          onErrorRef.current?.({ code: 'SCENE_POP_FAILED', message: err.message });
        });
        break;
      case 'replace': {
        const configs = models.map((m) => ({ ...m } as Record<string, unknown>));
        NativeModule.replaceScene(configs).catch((err: Error) => {
          onErrorRef.current?.({ code: 'SCENE_REPLACE_FAILED', message: err.message });
        });
        break;
      }
      case 'popToTop':
        NativeModule.popToTop().catch((err: Error) => {
          onErrorRef.current?.({ code: 'SCENE_POP_TO_TOP_FAILED', message: err.message });
        });
        break;
    }
  }, []);

  const handleModelsChanged = React.useCallback((models: ModelRegistration[]) => {
    pendingModelsRef.current = models;
  }, []);

  // Send scene config to native whenever scene changes (M4: single code path)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      sendModelsToNative(pendingModelsRef.current);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentScene, sendModelsToNative]);

  const navigator = React.useMemo<ARSceneNavigator>(() => ({
    push: (config: SceneConfig) => {
      lastActionRef.current = 'push';
      sceneStackRef.current.push(config);
      setSceneKey(k => k + 1);
      setCurrentScene(config);
    },
    pop: () => {
      if (sceneStackRef.current.length <= 1) return;
      lastActionRef.current = 'pop';
      sceneStackRef.current.pop();
      const prev = sceneStackRef.current[sceneStackRef.current.length - 1];
      setSceneKey(k => k + 1);
      setCurrentScene(prev);
    },
    replace: (config: SceneConfig) => {
      lastActionRef.current = 'replace';
      sceneStackRef.current[sceneStackRef.current.length - 1] = config;
      setSceneKey(k => k + 1);
      setCurrentScene(config);
    },
    popToTop: () => {
      lastActionRef.current = 'popToTop';
      const first = sceneStackRef.current[0];
      sceneStackRef.current = [first];
      setSceneKey(k => k + 1);
      setCurrentScene(first);
    },
  }), []);

  // Render the current scene component
  const SceneComponent = currentScene.scene;

  return (
    <ARNavigatorProvider navigator={navigator} tracking={tracking} sceneProps={currentScene.passProps}>
      <NativeARView style={style} />
      <ARSceneProvider key={sceneKey} onModelsChanged={handleModelsChanged}>
        <SceneComponent />
      </ARSceneProvider>
    </ARNavigatorProvider>
  );
}
