import AppBlockerModule from './src/AppBlockerModule';
import { EventSubscription } from 'expo-modules-core';

/**
 * Start the native app-blocker monitoring service.
 * @param blockedPackages    List of Android package names to block.
 * @param allowBreaks        Whether the current session allows breaks.
 * @param remainingBreakSec  Remaining break time in seconds (for overlay display).
 */
export function startMonitoring(
  blockedPackages: string[],
  allowBreaks: boolean = false,
  remainingBreakSec: number = 0,
) {
  return AppBlockerModule.startMonitoring(blockedPackages, allowBreaks, remainingBreakSec);
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

type ViolationEvent = { packageName: string; allowMinutes?: number };
type BreakStartedEvent = { breakMinutes: number; packageName?: string };
type BreakEndedEvent = Record<string, never>;

export function addListener(eventName: 'onAppViolation', listener: (event: ViolationEvent) => void): EventSubscription;
export function addListener(eventName: 'onBreakStarted', listener: (event: BreakStartedEvent) => void): EventSubscription;
export function addListener(eventName: 'onBreakEnded', listener: (event: BreakEndedEvent) => void): EventSubscription;
export function addListener(eventName: string, listener: (event: any) => void): EventSubscription {
  return AppBlockerModule.addListener(eventName, listener);
}
