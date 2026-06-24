// ============================================================
// Focussive Backend — User Controller
// ============================================================

import type { Response } from 'express';
import bcrypt from 'bcrypt';
import supabase from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { isValidPassword } from '@focussive/shared';

const SALT_ROUNDS = 12;

// GET /user/profile
export async function getProfile(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, name, age, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  res.json(user);
}

// PUT /user/profile
export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { name, age } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (age !== undefined) updates.age = age;

  if (Object.keys(updates).length === 0) {
    throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
  }

  const { data: user, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select('id, email, name, age, created_at, updated_at')
    .single();

  if (error || !user) {
    throw new AppError('Failed to update profile', 500, 'UPDATE_ERROR');
  }

  res.json(user);
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
