import { requireNativeModule } from 'expo';

export type InstalledAppInfo = {
  id: string;
  name: string;
  icon: string; // Base64 data URI, e.g. "data:image/png;base64,..."
};

export type AppUsageInfo = {
  id: string;
  name: string;
  totalTimeMillis: number;
  icon?: string;
};

type InstalledAppsModuleType = {
  getApps(): Promise<InstalledAppInfo[]>;
  getWeeklyUsageStats?(): Promise<AppUsageInfo[]>;
  getForegroundApp?(): Promise<any>;
  hasUsageStatsPermission?(): Promise<boolean>;
  requestUsageStatsPermission?(): Promise<void>;
  killApp?(packageName: string): Promise<boolean>;
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

