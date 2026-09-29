// ============================================================
// Focussive Backend — Subscription & Trial Service
// ============================================================

import { v4 as uuidv4 } from 'uuid';
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

export async function redeemPromoCode(
  userId: string,
  rawCode: string
): Promise<SubscriptionStatusResponse & { message: string }> {
  if (!rawCode || typeof rawCode !== 'string') {
    throw new AppError('Promo code is required', 400, 'VALIDATION_ERROR');
  }

  const code = rawCode.trim().toUpperCase();

  // Find promo code
  const { data: promo, error: promoErr } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('code', code)
    .single();

  if (promoErr || !promo) {
    throw new AppError('Invalid promo code. Please check and try again.', 404, 'INVALID_CODE');
  }

  if (!promo.is_active) {
    throw new AppError('This promo code is no longer active.', 400, 'CODE_INACTIVE');
  }

  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    throw new AppError('This promo code has expired.', 400, 'CODE_EXPIRED');
  }

  if (promo.max_uses && promo.times_used >= promo.max_uses) {
    throw new AppError('This promo code has reached its maximum redemptions.', 400, 'CODE_DEPLETED');
  }

  // Check if user has already redeemed this code
  const { data: existingRedemption } = await supabase
    .from('promo_redemptions')
    .select('id')
    .eq('promo_code_id', promo.id)
    .eq('user_id', userId)
    .single();

  if (existingRedemption) {
    throw new AppError('You have already redeemed this promo code.', 400, 'ALREADY_REDEEMED');
  }

  // Calculate new expiration date
  const now = new Date();
  let newEndsAt: string | null = null;
  const durationDays = promo.duration_days;

  if (durationDays) {
    const { data: currentUser } = await supabase
      .from('users')
      .select('trial_ends_at')
      .eq('id', userId)
      .single();

    const baseDate =
      currentUser?.trial_ends_at && new Date(currentUser.trial_ends_at) > now
        ? new Date(currentUser.trial_ends_at)
        : now;

    newEndsAt = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  }

  // Record redemption
  const { error: redErr } = await supabase
    .from('promo_redemptions')
    .insert({
      id: uuidv4(),
      promo_code_id: promo.id,
      user_id: userId,
      redeemed_at: now.toISOString(),
    });

  if (redErr) {
    console.error('Failed to insert redemption:', redErr);
    throw new AppError('Failed to redeem promo code. Please try again.', 500, 'REDEMPTION_ERROR');
  }

  // Increment usage count
  await supabase
    .from('promo_codes')
    .update({ times_used: (promo.times_used || 0) + 1 })
    .eq('id', promo.id);

  // Update user subscription
  const userUpdates: Record<string, unknown> = {
    subscription_tier: 'premium',
    subscription_status: 'active',
  };
  if (newEndsAt) {
    userUpdates.trial_ends_at = newEndsAt;
  }

  await supabase
    .from('users')
    .update(userUpdates)
    .eq('id', userId);

  const updatedStatus = await getSubscriptionStatus(userId);
  const durationText = durationDays ? `${durationDays} days of ` : 'Lifetime ';
  return {
    ...updatedStatus,
    message: `Congratulations! ${durationText}Focussive Premium has been unlocked.`,
  };
}
