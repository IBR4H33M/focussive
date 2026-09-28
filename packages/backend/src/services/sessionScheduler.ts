// ============================================================
// Focussive Backend — Session Scheduler
// ============================================================

import supabase from '../config/supabase';
import { SessionStatus, ScheduleType, Weekday } from '@focussive/shared';
import { v4 as uuidv4 } from 'uuid';

const WEEKDAY_MAP: Record<number, Weekday> = {
  0: Weekday.SUNDAY,
  1: Weekday.MONDAY,
  2: Weekday.TUESDAY,
  3: Weekday.WEDNESDAY,
  4: Weekday.THURSDAY,
  5: Weekday.FRIDAY,
  6: Weekday.SATURDAY,
};

/**
 * Check if a session should be active now based on its schedule
 */
export function shouldSessionBeActive(session: any): boolean {
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentWeekday = WEEKDAY_MAP[now.getDay()];

  // Check if session was skipped for this occurrence
  if (session.skipped_until && new Date(session.skipped_until) > now) {
    return false;
  }

  // ── Guard: Don't re-activate a session that was already completed in the current time window.
  // This prevents the scheduler from re-activating a recurring session that just completed
  // while the clock is still inside its time slot, which would create duplicate history entries.
  if (session.completed_at) {
    const completedAt = new Date(session.completed_at);
    const completedMinutesAgo = (now.getTime() - completedAt.getTime()) / 60000;
    // If completed within the session's duration window, don't re-activate
    if (completedMinutesAgo < (session.duration || 25)) {
      return false;
    }
  }

  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
  let isInTimeWindow = false;

  if (Array.isArray(session.time_slots) && session.time_slots.length > 0) {
    for (const slot of session.time_slots) {
      if (!slot.start_time || !slot.end_time) continue;
      const [sh, sm] = slot.start_time.split(':').map(Number);
      const [eh, em] = slot.end_time.split(':').map(Number);
      const slotStart = sh * 60 + sm;
      let slotEnd = eh * 60 + em;
      if (slotEnd <= slotStart) slotEnd += 24 * 60; // handles overnight slot

      if (currentTimeMinutes >= slotStart && currentTimeMinutes < slotEnd) {
        isInTimeWindow = true;
        break;
      }
    }
  } else if (session.start_time) {
    // Parse session start time
    const [startHour, startMinute] = session.start_time.split(':').map(Number);
    const startTime = startHour * 60 + startMinute; // minutes since midnight
    const endTimeMinutes = startTime + (session.duration || 25);
    isInTimeWindow = currentTimeMinutes >= startTime && currentTimeMinutes < endTimeMinutes;
  }

  if (!isInTimeWindow) return false;

  // Check schedule type
  switch (session.schedule) {
    case ScheduleType.TODAY:
      // Check if created today and hasn't run yet
      const createdDate = new Date(session.created_at).toISOString().split('T')[0];
      return createdDate === currentDate && !session.completed_at;

    case ScheduleType.RECURRING:
      // Check if current weekday is in schedule_days
      return Array.isArray(session.schedule_days) && session.schedule_days.includes(currentWeekday);

    case ScheduleType.SCHEDULED:
      // Check if current date is in schedule_days
      return Array.isArray(session.schedule_days) && session.schedule_days.includes(currentDate);

    default:
      return false;
  }
}

/**
 * Activate sessions that should be running now
 */
export async function activateSessions() {
  try {
    // Get all scheduled sessions
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', SessionStatus.SCHEDULED);

    if (error || !sessions) {
      console.error('[Scheduler] Error fetching sessions:', error);
      return;
    }

    // Check currently active users to guarantee no user has multiple sessions running simultaneously
    const { data: currentActive } = await supabase
      .from('sessions')
      .select('user_id')
      .eq('status', SessionStatus.ACTIVE);

    const activeUserIds = new Set((currentActive || []).map(s => s.user_id));

    const now = new Date();

    // Check each session
    for (const session of sessions) {
      if (activeUserIds.has(session.user_id)) {
        // User already has an active session! Skip to prevent simultaneous running sessions
        continue;
      }

      if (shouldSessionBeActive(session)) {
        let startedAt = now.toISOString();
        if (session.start_time) {
          const [sh, sm] = session.start_time.split(':').map(Number);
          const scheduledStart = new Date(now);
          scheduledStart.setHours(sh, sm, 0, 0);
          const scheduledEnd = new Date(scheduledStart.getTime() + (session.duration || 25) * 60_000);
          if (scheduledStart <= now && now < scheduledEnd) {
            startedAt = scheduledStart.toISOString();
          }
        }

        activeUserIds.add(session.user_id);

        // Activate the session
        const { error: updateError } = await supabase
          .from('sessions')
          .update({
            status: SessionStatus.ACTIVE,
            started_at: startedAt,
            pause_count: 0,
          })
          .eq('id', session.id);

        if (updateError) {
          console.error(`[Scheduler] Error activating session ${session.id}:`, updateError);
        } else {
          console.log(`[Scheduler] Activated session: ${session.name} (${session.id}) started_at ${startedAt}`);
        }
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error in activateSessions:', error);
  }
}

/**
 * Complete active sessions that have exceeded their duration
 */
export async function completeExpiredSessions() {
  try {
    const { data: activeSessions, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', SessionStatus.ACTIVE);

    if (error || !activeSessions) {
      console.error('[Scheduler] Error fetching active sessions:', error);
      return;
    }

    const now = new Date();

    for (const session of activeSessions) {
      try {
        // 1. Auto-close any expired break on this active session
        const { data: openBreak } = await supabase
          .from('session_breaks')
          .select('id, started_at, duration_seconds')
          .eq('session_id', session.id)
          .is('ended_at', null)
          .maybeSingle();

        if (openBreak && openBreak.duration_seconds) {
          const breakEndsMs = new Date(openBreak.started_at).getTime() + openBreak.duration_seconds * 1000;
          if (now.getTime() >= breakEndsMs) {
            const endedIso = new Date(breakEndsMs).toISOString();
            await supabase
              .from('session_breaks')
              .update({ ended_at: endedIso })
              .eq('id', openBreak.id);
            const newUsed = (session.break_used_seconds || 0) + openBreak.duration_seconds;
            await supabase
              .from('sessions')
              .update({ break_used_seconds: newUsed })
              .eq('id', session.id);
            session.break_used_seconds = newUsed;
          }
        }

        // 2. Evaluate if session has expired
        let isExpired = false;
        let elapsedMinutes = 0;

        if (session.started_at) {
          const startedAt = new Date(session.started_at);
          elapsedMinutes = (now.getTime() - startedAt.getTime()) / 60000;
          if (elapsedMinutes >= (session.duration || 25)) {
            isExpired = true;
          }
        } else if (session.start_time) {
          const [sh, sm] = session.start_time.split(':').map(Number);
          const startMinutes = sh * 60 + sm;
          const endMinutes = startMinutes + (session.duration || 25);
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          if (currentMinutes >= endMinutes) {
            isExpired = true;
            elapsedMinutes = session.duration || 25;
          }
        } else {
          isExpired = true;
        }

        if (isExpired) {
          const startedAt = session.started_at ? new Date(session.started_at) : now;
          // Get total violation count
          const { count: violationsCount } = await supabase
            .from('violations')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id);

          // Get app violations count
          const { count: appViolationsCount } = await supabase
            .from('violations')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id)
            .not('app_name', 'is', null);

          // Get web violations count
          const { count: webViolationsCount } = await supabase
            .from('violations')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id)
            .not('website_name', 'is', null);

          // Get breaks count
          const { count: breaksCount } = await supabase
            .from('session_breaks')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id);

          const { count: emergencyBreaksCount } = await supabase
            .from('session_breaks')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id)
            .eq('source', 'violation');

          // Snapshot blocked apps
          let blockedApps: string[] = [];
          const groupIds = session.app_group_ids || session.blocked_app_groups;
          if (Array.isArray(groupIds) && groupIds.length > 0) {
            const { data: groups } = await supabase
              .from('app_groups')
              .select('apps')
              .in('id', groupIds);
            if (groups && groups.length > 0) {
              const appSet = new Set<string>();
              for (const g of groups) {
                if (Array.isArray(g.apps)) {
                  for (const app of g.apps) {
                    const pkg = typeof app === 'string' ? app : (app?.packageName || app?.name || app?.id);
                    if (pkg) appSet.add(pkg);
                  }
                }
              }
              blockedApps = Array.from(appSet);
            }
          }

          const actualMins = Math.max(1, Math.floor(elapsedMinutes || session.duration || 25));
          const totalViolations = violationsCount || 0;
          const totalBreaks = (breaksCount || 0) + (emergencyBreaksCount || 0);
          const isOnSchedule = true;

          // Roll quality tier
          let qualityTier: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' = 'common';
          if (totalViolations === 0 && totalBreaks === 0 && actualMins >= 60 && (session.duration || 25) >= 60 && isOnSchedule) {
            qualityTier = 'legendary';
          } else if (totalViolations === 0 && totalBreaks === 0 && actualMins >= 30 && (session.duration || 25) >= 30) {
            qualityTier = 'epic';
          } else if (totalViolations === 0) {
            qualityTier = 'rare';
          } else if (totalViolations <= 1) {
            qualityTier = 'uncommon';
          } else {
            qualityTier = 'common';
          }

          const completedAt = now.toISOString();

          // Determine next status based on schedule type
          const nextStatus =
            session.schedule === ScheduleType.RECURRING || session.schedule === ScheduleType.SCHEDULED
              ? SessionStatus.SCHEDULED
              : SessionStatus.COMPLETED;

          // Update session
          await supabase
            .from('sessions')
            .update({
              status: nextStatus,
              completed_at: completedAt,
              started_at: null,
              pause_count: 0,
            })
            .eq('id', session.id);

          // Guard: check if a history entry already exists
          const { count: existingHistoryCount } = await supabase
            .from('session_history')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id)
            .eq('user_id', session.user_id)
            .eq('status', SessionStatus.COMPLETED)
            .gte('created_at', new Date(startedAt.getTime() - 60000).toISOString());

          if ((existingHistoryCount ?? 0) > 0) {
            console.log(`[Scheduler] Skipping duplicate history insert for session ${session.id} — already recorded`);
          } else {
            const startTimeStr = session.start_time || `${String(startedAt.getHours()).padStart(2, '0')}:${String(startedAt.getMinutes()).padStart(2, '0')}`;
            await supabase.from('session_history').insert({
              id: uuidv4(),
              session_id: session.id,
              user_id: session.user_id,
              session_name: session.name,
              scheduled_duration: session.duration || 25,
              actual_duration: actualMins,
              start_time: startTimeStr,
              status: SessionStatus.COMPLETED,
              violations_count: totalViolations,
              app_violations_count: appViolationsCount || 0,
              web_violations_count: webViolationsCount || 0,
              quality_tier: qualityTier,
              breaks_count: breaksCount || 0,
              emergency_breaks_count: emergencyBreaksCount || 0,
              is_on_schedule: isOnSchedule,
              blocked_apps: blockedApps,
              apps_count: blockedApps.length,
            });
          }

          console.log(`[Scheduler] Completed session: ${session.name} (${session.id})`);
        }
      } catch (sessionErr) {
        console.error(`[Scheduler] Error completing session ${session.id}:`, sessionErr);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error in completeExpiredSessions:', error);
  }
}

/**
 * Run the scheduler - check for sessions to activate and complete
 */
export async function runScheduler() {
  await activateSessions();
  await completeExpiredSessions();
}

/**
 * Start the scheduler with a given interval (in milliseconds)
 */
export function startScheduler(intervalMs: number = 30000) {
  console.log(`[Scheduler] Starting with ${intervalMs}ms interval`);
  
  // Run immediately
  runScheduler();
  
  // Then run at intervals
  return setInterval(runScheduler, intervalMs);
}
