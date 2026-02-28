import { NativeModule, requireNativeModule } from 'expo';

import { ReactNativeArViewModuleEvents } from './ReactNativeArView.types';

declare class ReactNativeArViewModule extends NativeModule<ReactNativeArViewModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ReactNativeArViewModule>('ReactNativeArView');
