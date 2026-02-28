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
