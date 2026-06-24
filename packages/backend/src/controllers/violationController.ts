// ============================================================
// Focussive Backend — Violation Controller
// ============================================================

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import supabase from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { ViolationAction } from '@focussive/shared';

// POST /violations
export async function createViolation(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { session_id, app_name, website_name, duration_seconds, action_taken } = req.body;

  if (!session_id || !action_taken) {
    throw new AppError('session_id and action_taken are required', 400, 'VALIDATION_ERROR');
  }

  if (!Object.values(ViolationAction).includes(action_taken)) {
    throw new AppError('Invalid action_taken value', 400, 'VALIDATION_ERROR');
  }

  // Verify session belongs to user
  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', session_id)
    .eq('user_id', userId)
    .single();

  if (!session) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  // If action is "mark_necessary", add to allowlist
  if (action_taken === ViolationAction.MARK_NECESSARY) {
    await supabase.from('session_allowlist').insert({
      id: uuidv4(),
      session_id,
      app_name: app_name || null,
      website_name: website_name || null,
    });

    res.status(201).json({ message: 'Marked as necessary', allowlisted: true });
    return;
  }

  // Log violation for "allow_anyway" or "closed"
  const { data: violation, error } = await supabase
    .from('violations')
    .insert({
      id: uuidv4(),
      session_id,
      user_id: userId,
      app_name: app_name || null,
      website_name: website_name || null,
      timestamp: new Date().toISOString(),
      duration_seconds: duration_seconds || 0,
      action_taken,
    })
    .select()
    .single();

  if (error || !violation) {
    throw new AppError('Failed to log violation', 500, 'CREATE_ERROR');
  }

  res.status(201).json(violation);
}

// GET /sessions/:id/violations
export async function getSessionViolations(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;

  // Verify session belongs to user
  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!session) {
    throw new AppError('Session not found', 404, 'NOT_FOUND');
  }

  const { data: violations, error } = await supabase
    .from('violations')
    .select('*')
    .eq('session_id', id)
    .order('timestamp', { ascending: false });

  if (error) {
    throw new AppError('Failed to fetch violations', 500, 'FETCH_ERROR');
  }

  res.json({ data: violations || [] });
}

// GET /violations/stats
export async function getViolationStats(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { data: violations, error } = await supabase
    .from('violations')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    throw new AppError('Failed to fetch violation stats', 500, 'FETCH_ERROR');
  }

  const allViolations = violations || [];

  // Compute stats
  const byAction: Record<string, number> = {
    [ViolationAction.ALLOW_ANYWAY]: 0,
    [ViolationAction.MARK_NECESSARY]: 0,
    [ViolationAction.CLOSED]: 0,
  };

  const appCounts: Record<string, number> = {};
  const websiteCounts: Record<string, number> = {};
  let totalDuration = 0;

  for (const v of allViolations) {
    byAction[v.action_taken] = (byAction[v.action_taken] || 0) + 1;

    if (v.app_name) {
      appCounts[v.app_name] = (appCounts[v.app_name] || 0) + 1;
    }
    if (v.website_name) {
      websiteCounts[v.website_name] = (websiteCounts[v.website_name] || 0) + 1;
    }
    totalDuration += v.duration_seconds || 0;
  }

  const mostViolatedApps = Object.entries(appCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const mostViolatedWebsites = Object.entries(websiteCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  res.json({
    total_violations: allViolations.length,
    by_action: byAction,
    most_violated_apps: mostViolatedApps,
    most_violated_websites: mostViolatedWebsites,
    average_duration_seconds:
      allViolations.length > 0 ? Math.round(totalDuration / allViolations.length) : 0,
  });
}
