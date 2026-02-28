import { registerWebModule, NativeModule } from 'expo';

import { ReactNativeArViewModuleEvents } from './ReactNativeArView.types';

class ReactNativeArViewModule extends NativeModule<ReactNativeArViewModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(ReactNativeArViewModule, 'ReactNativeArViewModule');
