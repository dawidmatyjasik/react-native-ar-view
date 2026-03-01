import { requireNativeView } from 'expo';
import * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type NativeARViewProps = {
  style?: StyleProp<ViewStyle>;
  planeDetection?: string;
};

const NativeARView: React.ComponentType<NativeARViewProps> =
  requireNativeView('ReactNativeArView');

export default NativeARView;
