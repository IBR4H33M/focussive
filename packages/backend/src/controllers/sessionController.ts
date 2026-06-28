// ============================================================
// Focussive Backend — Session Controller
// ============================================================

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import supabase from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { isSessionOverlap, SessionStatus } from '@focussive/shared';

// POST /sessions/:id/pause  — toggles active <-> paused
export async function pauseSession(req: AuthRequest, res: Response): Promise<void> {
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

  const isCurrentlyActive = session.status === SessionStatus.ACTIVE;
  const isCurrentlyPaused = session.status === 'paused';

  if (!isCurrentlyActive && !isCurrentlyPaused) {
    throw new AppError('Only active or paused sessions can be toggled', 400, 'INVALID_STATUS');
  }

  const newStatus = isCurrentlyActive ? 'paused' : SessionStatus.ACTIVE;
  // Increment pause_count only when going active -> paused
  const pauseCount = isCurrentlyActive ? (session.pause_count || 0) + 1 : session.pause_count;

  const { data: updated, error } = await supabase
    .from('sessions')
    .update({ status: newStatus, pause_count: pauseCount })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !updated) {
    throw new AppError('Failed to toggle pause', 500, 'UPDATE_ERROR');
  }

  res.json({ ...updated, message: isCurrentlyActive ? 'Session paused' : 'Session resumed' });
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
    app_group_id,
    blocked_websites,
  } = req.body;

  // Validation
  if (!name || !duration || !start_time) {
    throw new AppError('Name, duration, and start time are required', 400, 'VALIDATION_ERROR');
  }

  if (duration < 1 || duration > 480) {
    throw new AppError('Duration must be between 1 and 480 minutes', 400, 'VALIDATION_ERROR');
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
      app_group_id: app_group_id || null,
      blocked_websites: blocked_websites || [],
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
    'mobile_focus', 'browser_focus', 'app_group_id', 'blocked_websites',
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

  // Get violation count
  const { count: violationsCount } = await supabase
    .from('violations')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', id);

  // Calculate actual duration
  const startedAt = session.started_at ? new Date(session.started_at).getTime() : Date.now();
  const actualDuration = Math.floor((Date.now() - startedAt) / 60000);

  const now = new Date().toISOString();

  // Update session status
  await supabase
    .from('sessions')
    .update({ status: SessionStatus.CANCELLED, completed_at: now })
    .eq('id', id);

  // Create history entry (include pause_count)
  await supabase.from('session_history').insert({
    id: uuidv4(),
    session_id: id,
    user_id: userId,
    session_name: session.name,
    scheduled_duration: session.duration,
    actual_duration: actualDuration,
    start_time: session.start_time,
    status: SessionStatus.CANCELLED,
    violations_count: violationsCount || 0,
    pause_count: session.pause_count || 0,
    cancellation_reason: reason || null,
    cancelled_at: now,
  });

  res.json({
    message: 'Session cancelled',
    actual_duration: actualDuration,
    violations_count: violationsCount || 0,
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

  // Include violation counts and pause status
  const sessionsWithViolations = await Promise.all(
    (sessions || []).map(async (session) => {
      const { count } = await supabase
        .from('violations')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session.id);

      const { data: allowlist } = await supabase
        .from('session_allowlist')
        .select('app_name, website_name')
        .eq('session_id', session.id);

      return {
        ...session,
        violations_count: count || 0,
        allowlist: allowlist || [],
      };
    })
  );

  res.json({ data: sessionsWithViolations });
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
