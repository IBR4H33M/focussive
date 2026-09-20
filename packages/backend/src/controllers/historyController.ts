// ============================================================
// Focussive Backend — History Controller
// ============================================================

import type { Response } from 'express';
import supabase from '../config/supabase';
import { AppError } from '../middleware/errorHandler';
import type { AuthRequest } from '../middleware/auth';
import { isUserPremium } from '../services/subscriptionService';

// GET /history
export async function getHistory(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const isPremium = await isUserPremium(userId);

  let query = supabase
    .from('session_history')
    .select('*', { count: 'exact' })
    .eq('user_id', userId);

  if (!isPremium) {
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', threeWeeksAgo);
  }

  const { data: history, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new AppError('Failed to fetch history', 500, 'FETCH_ERROR');
  }

  res.json({
    data: history || [],
    total: count || 0,
    page,
    limit,
    is_premium: isPremium,
    history_limited: !isPremium,
    history_limit_days: isPremium ? null : 21,
  });
}

// GET /history/:id
export async function getHistoryDetail(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;

  const { data: historyEntry, error } = await supabase
    .from('session_history')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !historyEntry) {
    throw new AppError('History entry not found', 404, 'NOT_FOUND');
  }

  // Get violations for this session
  const { data: violations } = await supabase
    .from('violations')
    .select('*')
    .eq('session_id', historyEntry.session_id)
    .order('timestamp', { ascending: true });

  res.json({
    ...historyEntry,
    violations: violations || [],
  });
}

// POST /history/export
export async function exportHistory(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { session_ids, start_date, end_date } = req.body;

  let query = supabase
    .from('session_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (session_ids && session_ids.length > 0) {
    query = query.in('session_id', session_ids);
  }
  if (start_date) {
    query = query.gte('created_at', start_date);
  }
  if (end_date) {
    query = query.lte('created_at', end_date);
  }

  const { data: history, error } = await query;

  if (error) {
    throw new AppError('Failed to export history', 500, 'FETCH_ERROR');
  }

  // Generate CSV
  const headers = [
    'Session Name',
    'Status',
    'Scheduled Duration (min)',
    'Actual Duration (min)',
    'Start Time',
    'End Time',
    'Violations',
    'Cancellation Reason',
    'Date',
  ];

  const rows = (history || []).map((h) => [
    h.session_name,
    h.status,
    h.scheduled_duration,
    h.actual_duration || '',
    h.start_time,
    h.end_time || '',
    h.violations_count,
    h.cancellation_reason || '',
    new Date(h.created_at).toISOString().split('T')[0],
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=focussive_history.csv');
  res.send(csv);
}

// DELETE /history/:id — delete a single history entry
export async function deleteHistoryEntry(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;

  const { data: entry } = await supabase
    .from('session_history')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!entry) {
    throw new AppError('History entry not found', 404, 'NOT_FOUND');
  }

  const { error } = await supabase
    .from('session_history')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new AppError('Failed to delete history entry', 500, 'DELETE_ERROR');
  }

  res.status(204).send();
}

// DELETE /history — delete ALL history for this user
export async function deleteAllHistory(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { error } = await supabase
    .from('session_history')
    .delete()
    .eq('user_id', userId);

  if (error) {
    throw new AppError('Failed to delete history', 500, 'DELETE_ERROR');
  }

  res.status(204).send();
}

