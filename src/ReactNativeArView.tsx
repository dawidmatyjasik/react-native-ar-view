import { requireNativeView } from 'expo';
import * as React from 'react';

import { ReactNativeArViewProps } from './ReactNativeArView.types';

const NativeView: React.ComponentType<ReactNativeArViewProps> =
  requireNativeView('ReactNativeArView');

export default function ReactNativeArView(props: ReactNativeArViewProps) {
  return <NativeView {...props} />;
}
