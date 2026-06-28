import { requireNativeModule } from 'expo';

export type InstalledAppInfo = {
  id: string;
  name: string;
};

type InstalledAppsModuleType = {
  getApps(): Promise<InstalledAppInfo[]>;
};

// The native module only exists after a full APK rebuild.
// Gracefully fall back to null so the app doesn't crash in Expo Go / before rebuild.
let InstalledApps: InstalledAppsModuleType | null = null;
try {
  InstalledApps = requireNativeModule<InstalledAppsModuleType>('InstalledApps');
} catch {
  // Native module not available — will use predefined apps as fallback
}

export default InstalledApps;

