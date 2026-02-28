import * as React from 'react';

import { useModelRegistration } from './ARSceneContext';
import { ARModelProps } from './ReactNativeArView.types';

let modelIdCounter = 0;

export default function ARModel(props: ARModelProps) {
  const registration = useModelRegistration();
  const idRef = React.useRef(`model-${modelIdCounter++}`);

  React.useEffect(() => {
    if (!registration) return;

    const source = props.source;
    const sourceUri = typeof source === 'number' ? `asset://${source}` : source.uri;

    registration.registerModel(idRef.current, {
      sourceUri,
      placement: props.placement ?? 'tap',
      scale: props.scale ?? 1.0,
      rotation: props.rotation ?? [0, 0, 0],
      gestureScale: props.gestures?.scale ?? false,
      gestureRotate: props.gestures?.rotate ?? false,
      gestureScaleMin: props.gestures?.scaleRange?.[0] ?? 0.1,
      gestureScaleMax: props.gestures?.scaleRange?.[1] ?? 10.0,
    });

    return () => {
      registration.unregisterModel(idRef.current);
    };
  }, [
    registration,
    props.source,
    props.placement,
    props.scale,
    props.rotation,
    props.gestures?.scale,
    props.gestures?.rotate,
    props.gestures?.scaleRange,
  ]);

  return null;
}

ARModel.displayName = 'ARModel';
