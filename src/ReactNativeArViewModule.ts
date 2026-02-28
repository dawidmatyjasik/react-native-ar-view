import { NativeModule, requireNativeModule } from 'expo';

import { ReactNativeArViewModuleEvents } from './ReactNativeArView.types';

declare class ReactNativeArViewModule extends NativeModule<ReactNativeArViewModuleEvents> {
  pushScene(models: Array<Record<string, unknown>>): Promise<void>;
  popScene(): Promise<void>;
  replaceScene(models: Array<Record<string, unknown>>): Promise<void>;
  popToTop(): Promise<void>;
}

export default requireNativeModule<ReactNativeArViewModule>('ReactNativeArView');
