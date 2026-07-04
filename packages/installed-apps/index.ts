// Re-export the native module. On web, it will be resolved to InstalledAppsModule.web.ts
// and on native platforms to InstalledAppsModule.ts
export { default } from './src/InstalledAppsModule';
export type { InstalledAppInfo } from './src/InstalledAppsModule';

