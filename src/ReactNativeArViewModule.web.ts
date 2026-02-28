import { registerWebModule, NativeModule } from 'expo';

import { ReactNativeArViewModuleEvents } from './ReactNativeArView.types';

class ReactNativeArViewModule extends NativeModule<ReactNativeArViewModuleEvents> {
  async pushScene(_models: Array<Record<string, unknown>>): Promise<void> {
    console.warn('ARCore is not supported on web');
  }
  async popScene(): Promise<void> {
    console.warn('ARCore is not supported on web');
  }
  async replaceScene(_models: Array<Record<string, unknown>>): Promise<void> {
    console.warn('ARCore is not supported on web');
  }
  async popToTop(): Promise<void> {
    console.warn('ARCore is not supported on web');
  }
}

export default registerWebModule(ReactNativeArViewModule, 'ReactNativeArViewModule');
