// ============================================================
// Focussive Backend — Subscription & Trial Service
// ============================================================

import supabase from '../config/supabase';
import { AppError } from '../middleware/errorHandler';
import type { SubscriptionStatusResponse } from '@focussive/shared';

const TRIAL_DURATION_DAYS = 21; // 3 weeks

export async function isUserPremium(userId: string): Promise<boolean> {
  const { data: user, error } = await supabase
    .from('users')
    .select('subscription_tier, trial_ends_at')
    .eq('id', userId)
    .single();

  if (error || !user) return false;

  if (user.subscription_tier === 'premium') return true;

  if (user.trial_ends_at && new Date(user.trial_ends_at) > new Date()) {
    return true;
  }

  return false;
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResponse> {
  const { data: user, error } = await supabase
    .from('users')
    .select('subscription_tier, subscription_status, trial_used, trial_ends_at')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const now = new Date();
  const trialEndsAt = user.trial_ends_at ? new Date(user.trial_ends_at) : null;
  const isTrialActive = Boolean(trialEndsAt && trialEndsAt > now);

  let trialDaysRemaining = 0;
  if (isTrialActive && trialEndsAt) {
    trialDaysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  const isPremium = user.subscription_tier === 'premium' || isTrialActive;

  return {
    is_premium: isPremium,
    tier: (user.subscription_tier as 'free' | 'premium' | 'trial') || 'free',
    status: user.subscription_status || 'active',
    is_trial_active: isTrialActive,
    trial_used: Boolean(user.trial_used),
    trial_ends_at: user.trial_ends_at || null,
    trial_days_remaining: trialDaysRemaining,
  };
}

export async function startFreeTrial(userId: string): Promise<SubscriptionStatusResponse> {
  const { data: user, error } = await supabase
    .from('users')
    .select('trial_used, trial_ends_at, subscription_tier')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (user.trial_used) {
    throw new AppError(
      'The 3-week free trial has already been used on this account.',
      400,
      'TRIAL_ALREADY_USED'
    );
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await supabase
    .from('users')
    .update({
      trial_used: true,
      trial_ends_at: trialEndsAt,
      subscription_tier: 'trial',
      subscription_status: 'trialing',
    })
    .eq('id', userId);

  if (updateError) {
    throw new AppError('Failed to start trial', 500, 'UPDATE_ERROR');
  }

  return getSubscriptionStatus(userId);
}

export async function syncSubscription(
  userId: string,
  isPremium: boolean,
  customerId?: string
): Promise<SubscriptionStatusResponse> {
  const updates: Record<string, unknown> = {
    subscription_tier: isPremium ? 'premium' : 'free',
    subscription_status: isPremium ? 'active' : 'inactive',
  };

  if (customerId) {
    updates.revenuecat_customer_id = customerId;
  }

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId);

  if (error) {
    throw new AppError('Failed to sync subscription status', 500, 'UPDATE_ERROR');
  }

  return getSubscriptionStatus(userId);
}
