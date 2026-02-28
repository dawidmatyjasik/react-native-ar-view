import * as React from 'react';

import type { ARSceneNavigator, TrackingState } from './ReactNativeArView.types';

const ARNavigatorContext = React.createContext<ARSceneNavigator | null>(null);
const ARTrackingContext = React.createContext<TrackingState>('unavailable');
const ScenePropsContext = React.createContext<Record<string, unknown> | undefined>(undefined);

export function ARNavigatorProvider({
  navigator,
  tracking,
  sceneProps,
  children,
}: {
  navigator: ARSceneNavigator;
  tracking: TrackingState;
  sceneProps?: Record<string, unknown>;
  children: React.ReactNode;
}) {
  return (
    <ARNavigatorContext.Provider value={navigator}>
      <ARTrackingContext.Provider value={tracking}>
        <ScenePropsContext.Provider value={sceneProps}>
          {children}
        </ScenePropsContext.Provider>
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

export function useSceneProps<T = Record<string, unknown>>(initialValues: T): T;
export function useSceneProps<T = Record<string, unknown>>(): T | undefined;
export function useSceneProps<T = Record<string, unknown>>(initialValues?: T): T | undefined {
  const ctx = React.useContext(ScenePropsContext) as T | undefined;
  return ctx ?? initialValues;
}
