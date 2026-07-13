// ============================================================
// Focussive Backend — Session Controller
// ============================================================

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import supabase from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { isSessionOverlap, SessionStatus } from '@focussive/shared';

// POST /sessions/:id/start  — manually start a scheduled session
export async function startSession(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!session) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  if (session.status !== SessionStatus.SCHEDULED) {
    throw new AppError('Only scheduled sessions can be started', 400, 'INVALID_STATUS');
  }

  const now = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('sessions')
    .update({
      status: SessionStatus.ACTIVE,
      started_at: now,
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !updated) {
    throw new AppError('Failed to start session', 500, 'UPDATE_ERROR');
  }

  res.json({ ...updated, message: 'Session started' });
}

// GET /sessions
export async function getSessions(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .in('status', [SessionStatus.SCHEDULED, SessionStatus.ACTIVE])
    .order('start_time', { ascending: true });

  if (error) {
    throw new AppError('Failed to fetch sessions', 500, 'FETCH_ERROR');
  }

  res.json({ data: sessions || [] });
}

// GET /sessions/:id
export async function getSession(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;

  const { data: session, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !session) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  // Get violation count
  const { count } = await supabase
    .from('violations')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', id);

  res.json({ ...session, violations_count: count || 0 });
}

// POST /sessions
export async function createSession(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const {
    name,
    duration,
    schedule,
    schedule_days,
    start_time,
    mobile_focus,
    browser_focus,
    app_group_ids,
    blocked_websites,
    allow_breaks,
    max_break_minutes,
  } = req.body;

  // Validation
  if (!name || !duration || !start_time) {
    throw new AppError('Name, duration, and start time are required', 400, 'VALIDATION_ERROR');
  }

  if (duration < 1 || duration > 480) {
    throw new AppError('Duration must be between 1 and 480 minutes', 400, 'VALIDATION_ERROR');
  }

  if (allow_breaks && max_break_minutes != null) {
    if (max_break_minutes < 1 || max_break_minutes >= duration) {
      throw new AppError(
        'Max break time must be at least 1 minute and less than session duration',
        400,
        'VALIDATION_ERROR'
      );
    }
  }

  // Check for overlapping sessions
  const { data: existingSessions } = await supabase
    .from('sessions')
    .select('start_time, duration, schedule, schedule_days')
    .eq('user_id', userId)
    .in('status', [SessionStatus.SCHEDULED, SessionStatus.ACTIVE]);

  if (existingSessions) {
    const newSession = { start_time, duration, schedule, schedule_days: schedule_days || [] };
    for (const existing of existingSessions) {
      if (isSessionOverlap(existing, newSession)) {
        throw new AppError(
          'Session overlaps with an existing session',
          400,
          'SESSION_OVERLAP'
        );
      }
    }
  }

  const sessionId = uuidv4();

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      id: sessionId,
      user_id: userId,
      name,
      duration,
      schedule: schedule || 'today',
      schedule_days: schedule_days || [],
      start_time,
      mobile_focus: mobile_focus || false,
      browser_focus: browser_focus || false,
      app_group_ids: app_group_ids || [],
      blocked_websites: blocked_websites || [],
      allow_breaks: allow_breaks || false,
      max_break_minutes: allow_breaks ? (max_break_minutes || null) : null,
      break_used_seconds: 0,
      status: SessionStatus.SCHEDULED,
    })
    .select()
    .single();

  if (error || !session) {
    throw new AppError('Failed to create session', 500, 'CREATE_ERROR');
  }

  res.status(201).json(session);
}

// PUT /sessions/:id
export async function updateSession(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;

  // Check session exists and belongs to user
  const { data: existing } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!existing) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  if (existing.status === SessionStatus.ACTIVE) {
    throw new AppError('Cannot edit an active session', 400, 'SESSION_ACTIVE');
  }

  const allowedFields = [
    'name', 'duration', 'schedule', 'schedule_days', 'start_time',
    'mobile_focus', 'browser_focus', 'app_group_ids', 'blocked_websites',
    'allow_breaks', 'max_break_minutes',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  // Check for overlap if time-related fields changed
  if (updates.start_time || updates.duration || updates.schedule || updates.schedule_days) {
    const checkSession = { ...existing, ...updates };
    const { data: otherSessions } = await supabase
      .from('sessions')
      .select('start_time, duration, schedule, schedule_days')
      .eq('user_id', userId)
      .neq('id', id)
      .in('status', [SessionStatus.SCHEDULED, SessionStatus.ACTIVE]);

    if (otherSessions) {
      for (const other of otherSessions) {
        if (isSessionOverlap(other, checkSession)) {
          throw new AppError(
            'Updated session would overlap with an existing session',
            400,
            'SESSION_OVERLAP'
          );
        }
      }
    }
  }

  const { data: session, error } = await supabase
    .from('sessions')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !session) {
    throw new AppError('Failed to update session', 500, 'UPDATE_ERROR');
  }

  res.json(session);
}

// DELETE /sessions/:id
export async function deleteSession(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;

  const { data: existing } = await supabase
    .from('sessions')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!existing) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  if (existing.status === SessionStatus.ACTIVE) {
    throw new AppError('Cannot delete an active session. Cancel it first.', 400, 'SESSION_ACTIVE');
  }

  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new AppError('Failed to delete session', 500, 'DELETE_ERROR');
  }

  res.status(204).send();
}

// POST /sessions/:id/cancel
export async function cancelSession(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;
  const { reason } = req.body;

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!session) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  if (session.status !== SessionStatus.ACTIVE) {
    throw new AppError('Only active sessions can be cancelled', 400, 'INVALID_STATUS');
  }

  // Get total violation count
  const { count: violationsCount } = await supabase
    .from('violations')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', id);

  // Get app violations count
  const { count: appViolationsCount } = await supabase
    .from('violations')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', id)
    .not('app_name', 'is', null);

  // Get web violations count
  const { count: webViolationsCount } = await supabase
    .from('violations')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', id)
    .not('website_name', 'is', null);

  // Calculate actual duration
  const startedAt = session.started_at ? new Date(session.started_at).getTime() : Date.now();
  const actualDuration = Math.floor((Date.now() - startedAt) / 60000);

  const now = new Date().toISOString();

  const nextStatus = (session.schedule === 'recurring' || session.schedule === 'specific_days')
    ? SessionStatus.SCHEDULED
    : SessionStatus.CANCELLED;

  await supabase
    .from('sessions')
    .update({
      status: nextStatus,
      completed_at: now,
      started_at: null,
    })
    .eq('id', id);

  // End any open breaks
  await supabase
    .from('session_breaks')
    .update({ ended_at: now, duration_seconds: 0 })
    .eq('session_id', id)
    .is('ended_at', null);

  const { error: insertError } = await supabase.from('session_history').insert({
    id: uuidv4(),
    session_id: id,
    user_id: userId,
    session_name: session.name,
    scheduled_duration: session.duration,
    actual_duration: actualDuration,
    start_time: session.start_time,
    status: SessionStatus.CANCELLED,
    violations_count: violationsCount || 0,
    cancellation_reason: reason || null,
    cancelled_at: now,
  });

  if (insertError) {
    console.error('[SessionController] Failed to insert history for cancelled session:', insertError);
  }

  res.json({
    message: 'Session cancelled',
    actual_duration: actualDuration,
    violations_count: violationsCount || 0,
  });
}

// POST /sessions/:id/break/start
export async function startBreak(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;
  const { source = 'manual', minutes } = req.body;

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!session) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  if (session.status !== SessionStatus.ACTIVE) {
    throw new AppError('Session is not active', 400, 'INVALID_STATUS');
  }

  if (!session.allow_breaks) {
    throw new AppError('Breaks are not enabled for this session', 400, 'BREAKS_DISABLED');
  }

  // Check remaining break time
  const maxBreakSeconds = (session.max_break_minutes || 0) * 60;
  const remainingSeconds = maxBreakSeconds - (session.break_used_seconds || 0);

  if (remainingSeconds <= 0) {
    throw new AppError('No break time remaining', 400, 'NO_BREAK_TIME');
  }

  // Close any existing open break first
  await supabase
    .from('session_breaks')
    .update({ ended_at: new Date().toISOString(), duration_seconds: 0 })
    .eq('session_id', id)
    .is('ended_at', null);

  // Compute planned duration (capped to remaining)
  const plannedSeconds = minutes
    ? Math.min(Math.max(1, Number(minutes)) * 60, remainingSeconds)
    : remainingSeconds;

  const breakId = uuidv4();
  const { data: breakRecord, error } = await supabase
    .from('session_breaks')
    .insert({
      id: breakId,
      session_id: id,
      user_id: userId,
      source,
      duration_seconds: plannedSeconds, // Store planned so clients can compute break_ends_at
    })
    .select()
    .single();

  if (error || !breakRecord) {
    throw new AppError('Failed to start break', 500, 'CREATE_ERROR');
  }

  res.json({ ...breakRecord, remaining_break_seconds: remainingSeconds });
}

// POST /sessions/:id/break/end
export async function endBreak(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;
  const { break_id } = req.body;

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!session) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  // Find the open break
  let query = supabase
    .from('session_breaks')
    .select('*')
    .eq('session_id', id)
    .is('ended_at', null);

  if (break_id) query = query.eq('id', break_id);

  const { data: openBreak } = await query.single();

  if (!openBreak) {
    throw new AppError('No open break found', 404, 'NOT_FOUND');
  }

  const now = new Date();
  const startedAt = new Date(openBreak.started_at);
  const durationSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);

  // End the break
  const { error: breakError } = await supabase
    .from('session_breaks')
    .update({ ended_at: now.toISOString(), duration_seconds: durationSeconds })
    .eq('id', openBreak.id);

  if (breakError) {
    throw new AppError('Failed to end break', 500, 'UPDATE_ERROR');
  }

  // Update session's break_used_seconds
  const newUsed = (session.break_used_seconds || 0) + durationSeconds;
  const { data: updatedSession, error: sessionError } = await supabase
    .from('sessions')
    .update({ break_used_seconds: newUsed })
    .eq('id', id)
    .select()
    .single();

  if (sessionError) {
    throw new AppError('Failed to update session break time', 500, 'UPDATE_ERROR');
  }

  const maxBreakSeconds = (session.max_break_minutes || 0) * 60;
  const remainingSeconds = Math.max(0, maxBreakSeconds - newUsed);

  res.json({
    ...updatedSession,
    break_duration_seconds: durationSeconds,
    remaining_break_seconds: remainingSeconds,
  });
}

// GET /sessions/active
export async function getActiveSessions(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', SessionStatus.ACTIVE);

  if (error) {
    throw new AppError('Failed to fetch active sessions', 500, 'FETCH_ERROR');
  }

  const sessionsWithDetails = await Promise.all(
    (sessions || []).map(async (session) => {
      const { count } = await supabase
        .from('violations')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session.id);

      const { data: allowlist } = await supabase
        .from('session_allowlist')
        .select('app_name, website_name')
        .eq('session_id', session.id);

      // Calculate remaining break time
      const maxBreakSeconds = (session.max_break_minutes || 0) * 60;
      const remainingBreakSeconds = session.allow_breaks
        ? Math.max(0, maxBreakSeconds - (session.break_used_seconds || 0))
        : 0;

      // Check for an active (open) break
      let isOnBreak = false;
      let breakEndsAt: string | null = null;
      if (session.allow_breaks) {
        const { data: openBreak } = await supabase
          .from('session_breaks')
          .select('id, started_at, duration_seconds')
          .eq('session_id', session.id)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (openBreak) {
          isOnBreak = true;
          // If we know the planned duration, compute end time
          if (openBreak.duration_seconds) {
            const endsMs = new Date(openBreak.started_at).getTime() + openBreak.duration_seconds * 1000;
            breakEndsAt = new Date(endsMs).toISOString();
          }
        }
      }

      return {
        ...session,
        violations_count: count || 0,
        allowlist: allowlist || [],
        remaining_break_seconds: remainingBreakSeconds,
        is_on_break: isOnBreak,
        break_ends_at: breakEndsAt,
      };
    })
  );

  res.json({ data: sessionsWithDetails });
}

// GET /sessions/upcoming
export async function getUpcomingSessions(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', SessionStatus.SCHEDULED)
    .order('start_time', { ascending: true });

  if (error) {
    throw new AppError('Failed to fetch upcoming sessions', 500, 'FETCH_ERROR');
  }

  res.json({ data: sessions || [] });
}
