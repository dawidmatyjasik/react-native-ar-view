import * as React from 'react';

import { ReactNativeArViewProps } from './ReactNativeArView.types';

export default function ReactNativeArView(props: ReactNativeArViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
