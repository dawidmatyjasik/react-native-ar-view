import type { StyleProp, ViewStyle } from 'react-native';

// --- Model types ---

export type ModelSource =
  | { uri: string }    // remote URL
  | number;            // require('./model.glb') returns a number

export type GestureConfig = {
  scale?: boolean;
  rotate?: boolean;
  scaleRange?: [number, number];
  scaleSensitivity?: number; // 0-1, dampens pinch gesture speed (default 0.3)
};

export type ARModelProps = {
  source: ModelSource;
  placement?: 'tap';
  scale?: number;
  rotation?: [number, number, number];
  gestures?: GestureConfig;
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
