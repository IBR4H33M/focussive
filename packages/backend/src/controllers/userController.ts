// ============================================================
// Focussive Backend — User Controller
// ============================================================

import type { Response } from 'express';
import bcrypt from 'bcrypt';
import supabase from '../config/supabase';
import { AppError } from '../middleware/errorHandler';
import type { AuthRequest } from '../middleware/auth';
import { isValidPassword } from '@focussive/shared';
import {
  getSubscriptionStatus,
  startFreeTrial,
  syncSubscription,
} from '../services/subscriptionService';

const SALT_ROUNDS = 12;

// GET /user/profile
export async function getProfile(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, name, age, avatar_url, overlay_quote_enabled, overlay_gif_enabled, overlay_gif_url, monthly_skip_limit, subscription_tier, subscription_status, trial_used, trial_ends_at, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // Count skips used this calendar month
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { count: skipsCount } = await supabase
    .from('session_skips')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('skipped_at', startOfMonth);

  const monthlyLimit = user.monthly_skip_limit ?? 5;
  const skipsUsed = skipsCount ?? 0;
  const skipsRemaining = Math.max(0, monthlyLimit - skipsUsed);

  const subStatus = await getSubscriptionStatus(userId);

  res.json({
    ...user,
    ...subStatus,
    monthly_skip_limit: monthlyLimit,
    skips_used_this_month: skipsUsed,
    skips_remaining: skipsRemaining,
  });
}

// PUT /user/profile
export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { name, age, avatar_url, overlay_quote_enabled, overlay_gif_enabled, overlay_gif_url, monthly_skip_limit } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (age !== undefined) updates.age = age;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (overlay_quote_enabled !== undefined) updates.overlay_quote_enabled = overlay_quote_enabled;
  if (overlay_gif_enabled !== undefined) updates.overlay_gif_enabled = overlay_gif_enabled;
  if (overlay_gif_url !== undefined) updates.overlay_gif_url = overlay_gif_url;
  if (monthly_skip_limit !== undefined) {
    const parsed = parseInt(String(monthly_skip_limit), 10);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      throw new AppError('Monthly skip limit must be between 0 and 100', 400, 'VALIDATION_ERROR');
    }
    updates.monthly_skip_limit = parsed;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
  }

  const { data: user, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select('id, email, name, age, avatar_url, overlay_quote_enabled, overlay_gif_enabled, overlay_gif_url, monthly_skip_limit, created_at, updated_at')
    .single();

  if (error || !user) {
    throw new AppError('Failed to update profile', 500, 'UPDATE_ERROR');
  }

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { count: skipsCount } = await supabase
    .from('session_skips')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('skipped_at', startOfMonth);

  const monthlyLimit = user.monthly_skip_limit ?? 5;
  const skipsUsed = skipsCount ?? 0;
  const skipsRemaining = Math.max(0, monthlyLimit - skipsUsed);

  res.json({
    ...user,
    monthly_skip_limit: monthlyLimit,
    skips_used_this_month: skipsUsed,
    skips_remaining: skipsRemaining,
  });
}

// PUT /user/password
export async function updatePassword(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { current_password, new_password, new_password_confirm } = req.body;

  if (!current_password || !new_password || !new_password_confirm) {
    throw new AppError('All password fields are required', 400, 'VALIDATION_ERROR');
  }

  if (new_password !== new_password_confirm) {
    throw new AppError('New passwords do not match', 400, 'VALIDATION_ERROR');
  }

  if (!isValidPassword(new_password)) {
    throw new AppError(
      'Password must be at least 8 characters with uppercase, lowercase, and number',
      400,
      'VALIDATION_ERROR'
    );
  }

  // Get current hash
  const { data: user } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', userId)
    .single();

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const isMatch = await bcrypt.compare(current_password, user.password_hash);
  if (!isMatch) {
    throw new AppError('Current password is incorrect', 401, 'INVALID_PASSWORD');
  }

  const password_hash = await bcrypt.hash(new_password, SALT_ROUNDS);

  await supabase
    .from('users')
    .update({ password_hash })
    .eq('id', userId);

  res.json({ message: 'Password updated successfully' });
}

// DELETE /user/account
export async function deleteAccount(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);

  if (error) {
    throw new AppError('Failed to delete account', 500, 'DELETE_ERROR');
  }

  res.status(204).send();
}

// GET /user/subscription
export async function getSubscription(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const status = await getSubscriptionStatus(userId);
  res.json(status);
}

// POST /user/trial/start
export async function startTrial(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const status = await startFreeTrial(userId);
  res.json(status);
}

// POST /user/subscription/sync
export async function syncSubscriptionController(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { is_premium, customer_id } = req.body;
  const status = await syncSubscription(userId, Boolean(is_premium), customer_id);
  res.json(status);
}
