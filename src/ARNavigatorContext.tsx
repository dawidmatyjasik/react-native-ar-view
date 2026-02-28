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
