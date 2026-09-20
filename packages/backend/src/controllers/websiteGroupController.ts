// ============================================================
// Focussive Backend — Website Groups Controller
// ============================================================

import type { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import supabase from '../config/supabase';
import { AppError } from '../middleware/errorHandler';
import type { AuthRequest } from '../middleware/auth';

import { isUserPremium } from '../services/subscriptionService';

const DEFAULT_SOCIAL_MEDIA_GROUP = {
  name: 'Social Media',
  websites: ['facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'reddit.com', 'pinterest.com'],
  is_default: true,
};

// GET /website-groups
export async function getWebsiteGroups(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  let { data: groups, error } = await supabase
    .from('website_groups')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new AppError('Failed to fetch website groups', 500, 'FETCH_ERROR');

  // Auto-create default Social Media group if they don't have one
  const hasDefault = groups && groups.some(g => g.is_default);
  if (!hasDefault) {
    const { data: newGroup, error: createErr } = await supabase
      .from('website_groups')
      .insert({ id: uuidv4(), user_id: userId, ...DEFAULT_SOCIAL_MEDIA_GROUP })
      .select()
      .single();

    if (createErr) throw new AppError('Failed to create default group', 500, 'CREATE_ERROR');
    groups = groups ? [...groups, newGroup] : [newGroup];
  }

  res.json({ data: groups });
}

// POST /website-groups
export async function createWebsiteGroup(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { name, websites } = req.body;

  if (!name) throw new AppError('Name is required', 400, 'VALIDATION_ERROR');

  const isPremium = await isUserPremium(userId);
  if (!isPremium) {
    const { count, error: countErr } = await supabase
      .from('website_groups')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (!countErr && (count || 0) >= 2) {
      throw new AppError(
        'Free tier is limited to 2 website groups. Upgrade to Premium for unlimited groups.',
        403,
        'PREMIUM_REQUIRED'
      );
    }

    if (Array.isArray(websites) && websites.length > 3) {
      throw new AppError(
        'Free tier is limited to 3 websites per group. Upgrade to Premium for unlimited websites.',
        403,
        'PREMIUM_REQUIRED'
      );
    }
  }

  const { data: group, error } = await supabase
    .from('website_groups')
    .insert({ id: uuidv4(), user_id: userId, name, websites: websites || [], is_default: false })
    .select()
    .single();

  if (error || !group) {
    console.error('Supabase error creating website group:', error);
    throw new AppError('Failed to create website group', 500, 'CREATE_ERROR');
  }

  res.status(201).json(group);
}

// PUT /website-groups/:id
export async function updateWebsiteGroup(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;
  const { name, websites } = req.body;

  const { data: existing } = await supabase
    .from('website_groups')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!existing) throw new AppError('Website group not found', 404, 'NOT_FOUND');

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (websites !== undefined) {
    const isPremium = await isUserPremium(userId);
    if (!isPremium && Array.isArray(websites) && websites.length > 3) {
      throw new AppError(
        'Free tier is limited to 3 websites per group. Upgrade to Premium for unlimited websites.',
        403,
        'PREMIUM_REQUIRED'
      );
    }
    updates.websites = websites;
  }

  const { data: group, error } = await supabase
    .from('website_groups')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !group) {
    console.error('Supabase error updating website group:', error);
    throw new AppError('Failed to update website group', 500, 'UPDATE_ERROR');
  }

  res.json(group);
}

// DELETE /website-groups/:id
export async function deleteWebsiteGroup(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { id } = req.params;

  const { data: existing } = await supabase
    .from('website_groups')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!existing) throw new AppError('Website group not found', 404, 'NOT_FOUND');

  const { error } = await supabase
    .from('website_groups')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw new AppError('Failed to delete website group', 500, 'DELETE_ERROR');

  res.status(204).send();
}
