import * as React from 'react';

import { useModelRegistration } from './ARSceneContext';
import { ARModelProps } from './ReactNativeArView.types';

export default function ARModel(props: ARModelProps) {
  const registration = useModelRegistration();
  const id = React.useId();

  const sourceUri = typeof props.source === 'number'
    ? `asset://${props.source}`
    : props.source.uri;
  const placement = props.placement ?? 'tap';
  const scale = props.scale ?? 1.0;
  const rotX = props.rotation?.[0] ?? 0;
  const rotY = props.rotation?.[1] ?? 0;
  const rotZ = props.rotation?.[2] ?? 0;
  const gestureScale = props.gestures?.scale ?? false;
  const gestureRotate = props.gestures?.rotate ?? false;
  const gestureScaleMin = props.gestures?.scaleRange?.[0] ?? 0.1;
  const gestureScaleMax = props.gestures?.scaleRange?.[1] ?? 10.0;

  React.useEffect(() => {
    if (!registration) return;

    registration.registerModel(id, {
      id,
      sourceUri,
      placement,
      scale,
      rotation: [rotX, rotY, rotZ],
      gestureScale,
      gestureRotate,
      gestureScaleMin,
      gestureScaleMax,
    });

    return () => {
      registration.unregisterModel(id);
    };
  }, [
    registration,
    id,
    sourceUri,
    placement,
    scale,
    rotX,
    rotY,
    rotZ,
    gestureScale,
    gestureRotate,
    gestureScaleMin,
    gestureScaleMax,
  ]);

  return null;
}

ARModel.displayName = 'ARModel';
