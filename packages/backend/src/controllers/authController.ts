// ============================================================
// Focussive Backend — Auth Controller
// ============================================================

import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import supabase from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AuthRequest } from '../middleware/auth.js';
import { isValidEmail, isValidPassword, generateQRCode } from '@focussive/shared';

const SALT_ROUNDS = 12;
const JWT_EXPIRY = '7d';
const REFRESH_EXPIRY = '30d';
const QR_EXPIRY_MINUTES = 5;

function generateTokens(userId: string) {
  const secret = process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!secret || !refreshSecret) {
    throw new AppError('JWT secrets not configured', 500, 'CONFIG_ERROR');
  }

  const token = jwt.sign({ userId }, secret, { expiresIn: JWT_EXPIRY });
  const refresh_token = jwt.sign({ userId }, refreshSecret, {
    expiresIn: REFRESH_EXPIRY,
  });

  return { token, refresh_token };
}

// POST /auth/signup
export async function signup(req: Request, res: Response): Promise<void> {
  const { email, name, password, passwordConfirm, age } = req.body;

  // Validation
  if (!email || !name || !password || !passwordConfirm) {
    throw new AppError('All fields are required', 400, 'VALIDATION_ERROR');
  }

  if (!isValidEmail(email)) {
    throw new AppError('Invalid email format', 400, 'VALIDATION_ERROR');
  }

  if (!isValidPassword(password)) {
    throw new AppError(
      'Password must be at least 8 characters with uppercase, lowercase, and number',
      400,
      'VALIDATION_ERROR'
    );
  }

  if (password !== passwordConfirm) {
    throw new AppError('Passwords do not match', 400, 'VALIDATION_ERROR');
  }

  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .single();

  if (existingUser) {
    throw new AppError('Email already registered', 400, 'EMAIL_EXISTS');
  }

  // Hash password and create user
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const userId = uuidv4();

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      id: userId,
      email: email.toLowerCase(),
      name,
      password_hash,
      age: age || null,
    })
    .select('id, email, name, age, created_at, updated_at')
    .single();

  if (error || !user) {
    console.error('[Supabase Error] Failed to create user:', error);
    throw new AppError('Failed to create user', 500, 'CREATE_ERROR');
  }

  const tokens = generateTokens(userId);

  res.status(201).json({
    user,
    ...tokens,
  });
}

// POST /auth/login
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400, 'VALIDATION_ERROR');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !user) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const tokens = generateTokens(user.id);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, ...safeUser } = user;

  res.json({
    user: safeUser,
    ...tokens,
  });
}

// POST /auth/qr-generate
export async function qrGenerate(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  // Invalidate any existing QR codes for this user
  await supabase
    .from('qr_codes')
    .update({ used: true })
    .eq('user_id', userId)
    .eq('used', false);

  const code = generateQRCode();
  const expires_at = new Date(Date.now() + QR_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabase.from('qr_codes').insert({
    id: uuidv4(),
    user_id: userId,
    code,
    expires_at,
    used: false,
  });

  if (error) {
    throw new AppError('Failed to generate QR code', 500, 'CREATE_ERROR');
  }

  res.json({
    code,
    expires_at,
    expires_in_seconds: QR_EXPIRY_MINUTES * 60,
  });
}

// POST /auth/qr-login
export async function qrLogin(req: Request, res: Response): Promise<void> {
  const { code, device_type } = req.body;

  if (!code) {
    throw new AppError('QR code is required', 400, 'VALIDATION_ERROR');
  }

  const { data: qrCode, error } = await supabase
    .from('qr_codes')
    .select('*')
    .eq('code', code)
    .eq('used', false)
    .single();

  if (error || !qrCode) {
    throw new AppError('Invalid or expired QR code', 401, 'INVALID_QR');
  }

  // Check expiry
  if (new Date(qrCode.expires_at) < new Date()) {
    await supabase.from('qr_codes').update({ used: true }).eq('id', qrCode.id);
    throw new AppError('QR code has expired', 401, 'QR_EXPIRED');
  }

  // Mark as used
  await supabase.from('qr_codes').update({ used: true }).eq('id', qrCode.id);

  // Register device if device_type provided
  if (device_type) {
    await supabase.from('devices').insert({
      id: uuidv4(),
      user_id: qrCode.user_id,
      device_type,
    });
  }

  // Get user data
  const { data: user } = await supabase
    .from('users')
    .select('id, email, name, age, created_at, updated_at')
    .eq('id', qrCode.user_id)
    .single();

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const tokens = generateTokens(qrCode.user_id);

  res.json({
    user,
    ...tokens,
  });
}

// GET /auth/verify
export async function verify(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, name, age, created_at, updated_at')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  res.json({ user });
}

// POST /auth/refresh
export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    throw new AppError('Refresh token is required', 400, 'VALIDATION_ERROR');
  }

  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!refreshSecret) {
    throw new AppError('JWT secrets not configured', 500, 'CONFIG_ERROR');
  }

  let payload: { userId: string };
  try {
    payload = jwt.verify(refresh_token, refreshSecret) as { userId: string };
  } catch {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const tokens = generateTokens(payload.userId);
  res.json(tokens);
}
