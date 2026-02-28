import * as React from 'react';
import { Text, View } from 'react-native';

export default function NativeARView(props: { style?: any }) {
  return (
    <View style={[{ justifyContent: 'center', alignItems: 'center' }, props.style]}>
      <Text>AR is not supported on web</Text>
    </View>
  );
}
