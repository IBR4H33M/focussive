/**
 * Utility to filter out system UI, home launchers, keyboards, and internal OS apps
 * from both recommended apps and app group selection.
 */

const IGNORED_PACKAGE_PATTERNS = [
  'launcher',
  'systemui',
  'android.settings',
  'inputmethod',
  'honeyboard',
  'sidebarservice',
  'cocktailbarservice',
  'quickstep',
  'wallpaper',
  'screensaver',
  'com.sec.android.app.launcher',
  'com.android.systemui',
  'com.google.android.apps.nexuslauncher',
  'com.android.launcher',
  'com.mi.android.globallauncher',
  'com.miui.home',
  'com.oppo.launcher',
  'com.coloros.launcher',
  'com.oneplus.launcher',
  'com.huawei.android.launcher',
  'com.hihonor.android.launcher',
  'com.motorola.launcher3',
  'com.teslacoilsw.launcher',
  'com.microsoft.launcher',
  'com.google.android.inputmethod',
  'com.touchtype.swiftkey',
  'com.samsung.android.honeyboard',
  'com.google.android.googlequicksearchbox',
];

const IGNORED_NAME_PATTERNS = [
  'one ui',
  'system ui',
  'launcher',
  'home screen',
  'quickstep',
  'gboard',
  'keyboard',
  'settings',
];

export function isSystemOrUiApp(app: { id?: string; name?: string; packageName?: string }): boolean {
  const id = (app.id || app.packageName || '').toLowerCase().trim();
  const name = (app.name || '').toLowerCase().trim();

  if (!id && !name) return true;

  // Exact or prefix checks
  if (
    id === 'com.sec.android.app.launcher' ||
    id === 'com.android.systemui' ||
    id === 'com.google.android.apps.nexuslauncher'
  ) {
    return true;
  }

  // Check package patterns
  if (IGNORED_PACKAGE_PATTERNS.some(pattern => id.includes(pattern))) {
    return true;
  }

  // Check name patterns
  if (IGNORED_NAME_PATTERNS.some(pattern => name.includes(pattern))) {
    return true;
  }

  // Check standalone "Home" or ending with " Home" (e.g. "One UI Home", "Home screen")
  if (name === 'home' || name.endsWith(' home') || name.startsWith('home ')) {
    return true;
  }

  return false;
}
