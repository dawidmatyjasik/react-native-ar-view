import * as React from 'react';

import NativeARView from './ReactNativeArView';
import { ARNavigatorProvider } from './ARNavigatorContext';
import { ARSceneProvider, ModelRegistration } from './ARSceneContext';
import NativeModule from './ReactNativeArViewModule';
import type {
  ARNavigatorProps,
  ARSceneNavigator,
  SceneConfig,
  TrackingState,
} from './ReactNativeArView.types';

type NavigationAction = 'push' | 'pop' | 'replace' | 'popToTop';

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
  const lastActionRef = React.useRef<NavigationAction>('push');
  const pendingModelsRef = React.useRef<ModelRegistration[]>([]);
  const isInitialMount = React.useRef(true);

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

  const sendModelsToNative = React.useCallback((models: ModelRegistration[]) => {
    const configs = models.map((m) => ({ ...m } as Record<string, unknown>));
    const action = lastActionRef.current;

    switch (action) {
      case 'push':
        NativeModule.pushScene(configs).catch((err: Error) => {
          onError?.({ code: 'SCENE_PUSH_FAILED', message: err.message });
        });
        break;
      case 'pop':
        NativeModule.popScene().catch((err: Error) => {
          onError?.({ code: 'SCENE_POP_FAILED', message: err.message });
        });
        break;
      case 'replace':
        NativeModule.replaceScene(configs).catch((err: Error) => {
          onError?.({ code: 'SCENE_REPLACE_FAILED', message: err.message });
        });
        break;
      case 'popToTop':
        NativeModule.popToTop().catch((err: Error) => {
          onError?.({ code: 'SCENE_POP_TO_TOP_FAILED', message: err.message });
        });
        break;
    }
  }, [onError]);

  const handleModelsChanged = React.useCallback((models: ModelRegistration[]) => {
    pendingModelsRef.current = models;
  }, []);

  // Send scene config to native whenever scene changes
  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      // On initial mount, wait a tick for ARModel children to register
      const timer = setTimeout(() => {
        sendModelsToNative(pendingModelsRef.current);
      }, 0);
      return () => clearTimeout(timer);
    }
    // On subsequent navigations, also wait a tick for new scene's models to register
    const timer = setTimeout(() => {
      sendModelsToNative(pendingModelsRef.current);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentScene, sendModelsToNative]);

  const navigator = React.useMemo<ARSceneNavigator>(() => ({
    push: (config: SceneConfig) => {
      lastActionRef.current = 'push';
      sceneStackRef.current.push(config);
      setCurrentScene(config);
    },
    pop: () => {
      if (sceneStackRef.current.length <= 1) return;
      lastActionRef.current = 'pop';
      sceneStackRef.current.pop();
      const prev = sceneStackRef.current[sceneStackRef.current.length - 1];
      setCurrentScene(prev);
    },
    replace: (config: SceneConfig) => {
      lastActionRef.current = 'replace';
      sceneStackRef.current[sceneStackRef.current.length - 1] = config;
      setCurrentScene(config);
    },
    popToTop: () => {
      lastActionRef.current = 'popToTop';
      const first = sceneStackRef.current[0];
      sceneStackRef.current = [first];
      setCurrentScene(first);
    },
  }), []);

  // Render the current scene component
  const SceneComponent = currentScene.scene;

  return (
    <ARNavigatorProvider navigator={navigator} tracking={tracking}>
      <NativeARView style={style} />
      <ARSceneProvider onModelsChanged={handleModelsChanged}>
        <SceneComponent
          arSceneNavigator={navigator}
          passProps={currentScene.passProps}
        />
      </ARSceneProvider>
    </ARNavigatorProvider>
  );
}
