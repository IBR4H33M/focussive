import AppBlockerModule from './src/AppBlockerModule';

export function startMonitoring(blockedPackages: string[]) {
  return AppBlockerModule.startMonitoring(blockedPackages);
}

export function stopMonitoring() {
  return AppBlockerModule.stopMonitoring();
}

export function updateBlockedApps(blockedPackages: string[]) {
  return AppBlockerModule.updateBlockedApps(blockedPackages);
}

export function requestUsageStatsPermission() {
  return AppBlockerModule.requestUsageStatsPermission();
}

export function requestOverlayPermission() {
  return AppBlockerModule.requestOverlayPermission();
}

export async function hasRequiredPermissions(): Promise<boolean> {
  return await AppBlockerModule.hasRequiredPermissions();
}

import { EventSubscription } from 'expo-modules-core';

export function addListener(
  eventName: 'onAppViolation',
  listener: (event: { packageName: string }) => void
): EventSubscription {
  return AppBlockerModule.addListener(eventName, listener);
}
