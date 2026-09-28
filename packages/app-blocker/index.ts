import AppBlockerModule from './src/AppBlockerModule';
import { EventSubscription } from 'expo-modules-core';
import { Linking } from 'react-native';

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
  sessionId?: string,
  sessionName?: string,
  endAtMillis?: number,
  startAtMillis?: number,
) {
  return AppBlockerModule.startMonitoring(
    blockedPackages,
    allowBreaks,
    remainingBreakSec,
    sessionId ?? null,
    sessionName ?? null,
    endAtMillis ?? null,
    startAtMillis ?? null,
  );
}

export function stopMonitoring() {
  return AppBlockerModule.stopMonitoring();
}

export function takeBreak(minutes: number) {
  return AppBlockerModule.takeBreak(minutes);
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

export function requestNotificationPermission() {
  try {
    if (AppBlockerModule?.requestNotificationPermission) {
      AppBlockerModule.requestNotificationPermission();
      return;
    }
  } catch {}
  Linking.openSettings();
}

export async function hasUsageStatsPermission(): Promise<boolean> {
  return await AppBlockerModule.hasUsageStatsPermission();
}

export async function hasOverlayPermission(): Promise<boolean> {
  return await AppBlockerModule.hasOverlayPermission();
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

// ─── Live session notifications (native chronometer, non-dismissible) ──────

/**
 * Schedule (or idempotently update) a grey "session starts soon" notification
 * whose countdown ticks natively down to `targetAtMillis`. Fires at
 * `fireAtMillis` via AlarmManager — survives the app being killed.
 */
export function scheduleReminderNotification(
  id: number,
  sessionId: string,
  title: string,
  body: string,
  targetAtMillis: number,
  timeoutAtMillis: number,
  fireAtMillis: number,
) {
  return AppBlockerModule.scheduleReminderNotification(
    id, sessionId, title, body, targetAtMillis, timeoutAtMillis, fireAtMillis,
  );
}

/**
 * Schedule (or idempotently update) a green "session running" notification
 * whose countdown ticks natively down to `targetAtMillis` (the session end).
 * `violationsText` is shown on its own line in the expanded, card-style view.
 */
export function scheduleActiveNotification(
  id: number,
  sessionId: string,
  title: string,
  body: string,
  targetAtMillis: number,
  timeoutAtMillis: number,
  fireAtMillis: number,
  violationsText: string,
  allowBreaks?: boolean,
  remainingBreakSeconds?: number,
  startAtMillis?: number,
) {
  return AppBlockerModule.scheduleActiveNotification({
    id,
    sessionId,
    title,
    body,
    targetAtMillis,
    timeoutAtMillis,
    fireAtMillis,
    violationsText,
    allowBreaks: allowBreaks ?? true,
    remainingBreakSeconds: remainingBreakSeconds ?? 0,
    startAtMillis: startAtMillis ?? fireAtMillis,
  });
}

/** Silently refresh an already-posted running notification (e.g. violation count changed). */
export function updateActiveNotification(
  id: number,
  sessionId: string,
  title: string,
  body: string,
  targetAtMillis: number,
  timeoutAtMillis: number,
  violationsText: string,
  isOnBreak?: boolean,
  remainingBreakSeconds?: number,
  allowBreaks?: boolean,
  startAtMillis?: number,
  breakStartedAtMillis?: number,
) {
  return AppBlockerModule.updateActiveNotification({
    id,
    sessionId,
    title,
    body,
    targetAtMillis,
    timeoutAtMillis,
    violationsText,
    isOnBreak: isOnBreak ?? null,
    remainingBreakSeconds: remainingBreakSeconds ?? null,
    allowBreaks: allowBreaks ?? null,
    startAtMillis: startAtMillis ?? null,
    breakStartedAtMillis: breakStartedAtMillis ?? null,
  });
}

/** Post session completed notification immediately with tone and vibration. */
export function postCompletedNotification(sessionId: string, title: string) {
  return AppBlockerModule.postCompletedNotification(sessionId, title);
}

/** Cancel a pending alarm and/or dismiss a live session notification by id. */
export function cancelSessionNotification(id: number) {
  return AppBlockerModule.cancelSessionNotification(id);
}

export async function hasExactAlarmPermission(): Promise<boolean> {
  return await AppBlockerModule.hasExactAlarmPermission();
}

export function requestExactAlarmPermission() {
  return AppBlockerModule.requestExactAlarmPermission();
}

export async function isIgnoringBatteryOptimization(): Promise<boolean> {
  return await AppBlockerModule.isIgnoringBatteryOptimization();
}

export async function requestIgnoreBatteryOptimization(): Promise<boolean> {
  return await AppBlockerModule.requestIgnoreBatteryOptimization();
}
