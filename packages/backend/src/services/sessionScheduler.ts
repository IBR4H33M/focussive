// ============================================================
// Focussive Backend — Session Scheduler
// ============================================================

import supabase from '../config/supabase.js';
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
function shouldSessionBeActive(session: any): boolean {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentWeekday = WEEKDAY_MAP[now.getDay()];

  // Parse session start time
  const [startHour, startMinute] = session.start_time.split(':').map(Number);
  const startTime = startHour * 60 + startMinute; // minutes since midnight
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
  const endTimeMinutes = startTime + session.duration;

  // Check if current time is within the session window
  const isInTimeWindow = currentTimeMinutes >= startTime && currentTimeMinutes < endTimeMinutes;

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
async function activateSessions() {
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

    const now = new Date().toISOString();

    // Check each session
    for (const session of sessions) {
      if (shouldSessionBeActive(session)) {
        // Activate the session
        const { error: updateError } = await supabase
          .from('sessions')
          .update({
            status: SessionStatus.ACTIVE,
            started_at: now,
            pause_count: 0,
          })
          .eq('id', session.id);

        if (updateError) {
          console.error(`[Scheduler] Error activating session ${session.id}:`, updateError);
        } else {
          console.log(`[Scheduler] Activated session: ${session.name} (${session.id})`);
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
async function completeExpiredSessions() {
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
      if (!session.started_at) continue;

      const startedAt = new Date(session.started_at);
      const elapsedMinutes = (now.getTime() - startedAt.getTime()) / 60000;

      // If session has run longer than its duration, mark it as completed
      if (elapsedMinutes >= session.duration) {
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

        // Create history entry
        const { error: insertError } = await supabase.from('session_history').insert({
          id: uuidv4(),
          session_id: session.id,
          user_id: session.user_id,
          session_name: session.name,
          scheduled_duration: session.duration,
          actual_duration: Math.floor(elapsedMinutes),
          start_time: session.start_time,
          status: SessionStatus.COMPLETED,
          violations_count: violationsCount || 0,
        });

        if (insertError) {
          console.error(`[Scheduler] Failed to insert session history for ${session.id}:`, insertError);
        }

        console.log(`[Scheduler] Completed session: ${session.name} (${session.id})`);
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
