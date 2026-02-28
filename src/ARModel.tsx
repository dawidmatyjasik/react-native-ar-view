import * as React from 'react';

import { ARModelProps } from './ReactNativeArView.types';

export default function ARModel(_props: ARModelProps) {
  // ARModel is a declarative config component.
  // It doesn't render anything — ARNavigator reads its props
  // and forwards them to the native module.
  return null;
}

ARModel.displayName = 'ARModel';
