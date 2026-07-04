import { registerWebModule, NativeModule } from 'expo';

// InstalledAppsModule is not available on the web platform.
class InstalledAppsModule extends NativeModule<{}> {}

export default registerWebModule(InstalledAppsModule, 'InstalledAppsModule');
