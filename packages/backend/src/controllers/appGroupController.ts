// ============================================================
// Focussive Backend — App Group Controller
// ============================================================

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import supabase from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { PREDEFINED_APPS } from '@focussive/shared';

// GET /app-groups
export async function getAppGroups(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { data: groups, error } = await supabase
    .from('app_groups')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new AppError('Failed to fetch app groups', 500, 'FETCH_ERROR');
  }

  res.json({ data: groups || [] });
}

// POST /app-groups
export async function createAppGroup(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { name, apps } = req.body;

  if (!name) {
    throw new AppError('Group name is required', 400, 'VALIDATION_ERROR');
  }

  const { data: group, error } = await supabase
    .from('app_groups')
    .insert({
      id: uuidv4(),
      user_id: userId,
      name,
      apps: apps || [],
    })
    .select()
    .single();

  if (error || !group) {
    throw new AppError('Failed to create app group', 500, 'CREATE_ERROR');
  }

  res.status(201).json(group);
}

// PUT /app-groups/:id
export async function updateAppGroup(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;
  const { name, apps } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (apps !== undefined) updates.apps = apps;

  if (Object.keys(updates).length === 0) {
    throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
  }

  const { data: group, error } = await supabase
    .from('app_groups')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !group) {
    throw new AppError('App group not found', 404, 'NOT_FOUND');
  }

  res.json(group);
}

// DELETE /app-groups/:id
export async function deleteAppGroup(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;

  const { error } = await supabase
    .from('app_groups')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new AppError('Failed to delete app group', 500, 'DELETE_ERROR');
  }

  res.status(204).send();
}

// GET /app-groups/apps
export async function getAvailableApps(_req: AuthRequest, res: Response): Promise<void> {
  res.json({ data: PREDEFINED_APPS });
}
