// ============================================================
// Focussive Backend — Auth Controller
// ============================================================

import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Resend } from 'resend';
import supabase from '../config/supabase';
import { AppError } from '../middleware/errorHandler';
import type { AuthRequest } from '../middleware/auth';
import { isValidEmail, isValidPassword, generateQRCode } from '@focussive/shared';
import { getClientIp, parseUserAgent } from './deviceController';

const SALT_ROUNDS = 12;
const JWT_EXPIRY = '7d';
const REFRESH_EXPIRY = '30d';
const QR_EXPIRY_MINUTES = 5;

export async function registerExtensionDevice(userId: string, req: Request): Promise<string> {
  const { error: deleteError } = await supabase
    .from('devices')
    .delete()
    .eq('user_id', userId)
    .eq('device_type', 'extension');

  if (deleteError) {
    console.error('[registerExtensionDevice] delete error:', deleteError);
  }

  const userAgent = (req.headers['user-agent'] || 'Unknown').substring(0, 300);
  const parsedUa = parseUserAgent(userAgent);
  const ip = getClientIp(req);

  const fullDeviceInfo = {
    ip,
    browser: parsedUa.browser,
    os: parsedUa.os,
    user_agent: userAgent,
    last_seen_at: new Date().toISOString(),
    paired_at: new Date().toISOString(),
  };

  const deviceId = uuidv4();
  const deviceName = `${fullDeviceInfo.browser} on ${fullDeviceInfo.os}`;
  // Truncate to 490 chars to stay within VARCHAR(500)
  const tokenPayload = JSON.stringify(fullDeviceInfo).substring(0, 490);

  const { error: insertError } = await supabase.from('devices').insert({
    id: deviceId,
    user_id: userId,
    device_type: 'extension',
    device_name: deviceName,
    device_token: tokenPayload,
  });

  if (insertError) {
    console.error('[registerExtensionDevice] insert error:', insertError);
    throw new AppError('Failed to register extension device', 500, 'DEVICE_REGISTER_ERROR');
  }

  return deviceId;
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendVerificationEmail(email: string, code: string): Promise<void> {
  if (resend) {
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Focussive <onboarding@resend.dev>',
        to: email,
        subject: `${code} is your Focussive verification code`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0c0d0e; color: #ffffff; border-radius: 16px; border: 1px solid #1f2127;">
            <h2 style="font-weight: 300; letter-spacing: 1px; margin-bottom: 8px; color: #ffffff;">Focussive</h2>
            <p style="color: #9ca3af; font-size: 15px; margin-bottom: 24px; line-height: 1.5;">Welcome to Focussive! Please use the following 6-digit verification code to complete your registration:</p>
            <div style="background: #18191b; border: 1px solid #2d2f36; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
              <span style="font-family: monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #90EE90;">${code}</span>
            </div>
            <p style="color: #6b7280; font-size: 13px; margin: 0; line-height: 1.4;">This code will expire in 15 minutes. If you did not request this email, please ignore it.</p>
          </div>
        `,
      });
      console.log(`[Resend] Verification code sent to ${email}`);
    } catch (err) {
      console.error('[Resend Error] Failed to send verification email:', err);
    }
  } else {
    console.log(`\n========================================\n[Focussive DEV] RESEND_API_KEY not set.\nVerification code for ${email}: ${code}\n========================================\n`);
  }
}

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
    .select('id, email_verified')
    .eq('email', email.toLowerCase())
    .single();

  if (existingUser) {
    // If the account was registered but never verified, allow re-triggering verification
    if (existingUser.email_verified === false) {
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

      await supabase
        .from('users')
        .update({
          name,
          password_hash,
          age: age || null,
          verification_code: verificationCode,
          verification_expires_at: verificationExpiresAt,
        })
        .eq('id', existingUser.id);

      await sendVerificationEmail(email.toLowerCase(), verificationCode);

      res.status(200).json({
        message: 'Verification code sent to your email',
        requires_verification: true,
        email: email.toLowerCase(),
      });
      return;
    }

    throw new AppError('Email already registered', 400, 'EMAIL_EXISTS');
  }

  // Hash password and create user
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const userId = uuidv4();
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      id: userId,
      email: email.toLowerCase(),
      name,
      password_hash,
      age: age || null,
      email_verified: false,
      verification_code: verificationCode,
      verification_expires_at: verificationExpiresAt,
    })
    .select('id, email, name, age, email_verified, created_at, updated_at')
    .single();

  if (error || !user) {
    console.error('[Supabase Error] Failed to create user:', error);
    throw new AppError('Failed to create user', 500, 'CREATE_ERROR');
  }

  await sendVerificationEmail(user.email, verificationCode);

  res.status(201).json({
    message: 'Verification code sent to your email',
    requires_verification: true,
    email: user.email,
  });
}

// POST /auth/verify-email
export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { email, code } = req.body;

  if (!email || !code) {
    throw new AppError('Email and verification code are required', 400, 'VALIDATION_ERROR');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (user.email_verified) {
    const tokens = generateTokens(user.id);
    const { password_hash, verification_code, verification_expires_at, ...safeUser } = user;
    res.json({
      message: 'Email already verified',
      user: safeUser,
      ...tokens,
    });
    return;
  }

  if (!user.verification_code || user.verification_code !== code.toString().trim()) {
    throw new AppError('Invalid verification code', 400, 'INVALID_CODE');
  }

  if (user.verification_expires_at && new Date(user.verification_expires_at) < new Date()) {
    throw new AppError('Verification code has expired. Please request a new one.', 400, 'CODE_EXPIRED');
  }

  // Mark verified and clear verification fields
  const { data: updatedUser, error: updateError } = await supabase
    .from('users')
    .update({
      email_verified: true,
      verification_code: null,
      verification_expires_at: null,
    })
    .eq('id', user.id)
    .select('id, email, name, age, avatar_url, email_verified, created_at, updated_at')
    .single();

  if (updateError || !updatedUser) {
    throw new AppError('Failed to verify email', 500, 'UPDATE_ERROR');
  }

  const tokens = generateTokens(user.id);

  res.json({
    message: 'Email verified successfully',
    user: updatedUser,
    ...tokens,
  });
}

// POST /auth/resend-code
export async function resendVerificationCode(req: Request, res: Response): Promise<void> {
  const { email } = req.body;

  if (!email) {
    throw new AppError('Email is required', 400, 'VALIDATION_ERROR');
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (user.email_verified) {
    throw new AppError('Email is already verified', 400, 'ALREADY_VERIFIED');
  }

  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await supabase
    .from('users')
    .update({
      verification_code: verificationCode,
      verification_expires_at: verificationExpiresAt,
    })
    .eq('id', user.id);

  await sendVerificationEmail(user.email, verificationCode);

  res.json({
    message: 'A new verification code has been sent to your email',
  });
}

// POST /auth/login
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password, device_type } = req.body;

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

  // Check email verification status (only if explicitly false, so existing users aren't locked out)
  if (user.email_verified === false) {
    throw new AppError('Please verify your email address to log in', 403, 'EMAIL_NOT_VERIFIED');
  }

  const tokens = generateTokens(user.id);

  let deviceId: string | null = null;
  if (device_type === 'extension') {
    deviceId = await registerExtensionDevice(user.id, req);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, verification_code, verification_expires_at, ...safeUser } = user;

  res.json({
    user: safeUser,
    device_id: deviceId,
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

  const cleanCode = String(code).trim().toUpperCase();

  const { data: qrCode, error } = await supabase
    .from('qr_codes')
    .select('*')
    .ilike('code', cleanCode)
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
  let deviceId: string | null = null;
  if (device_type === 'extension') {
    deviceId = await registerExtensionDevice(qrCode.user_id, req);
  } else if (device_type) {
    deviceId = uuidv4();
    await supabase.from('devices').insert({
      id: deviceId,
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
    device_id: deviceId,
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

// ─── Direct Extension QR Pairing Sessions ─────────────────────

interface PairingSession {
  pin: string;
  code: string;
  createdAt: number;
  approvedUserId: string | null;
  tokens: { token: string; refresh_token: string; device_id: string } | null;
}

const pairingSessions = new Map<string, PairingSession>();

// Periodic cleanup of stale sessions older than 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [pin, session] of pairingSessions.entries()) {
    if (session.createdAt < cutoff) {
      pairingSessions.delete(pin);
    }
  }
}, 60 * 1000);

// POST /auth/pairing/start — called by extension to display QR + PIN
export async function startPairing(req: Request, res: Response): Promise<void> {
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const code = `focussive:pair:${pin}`;

  pairingSessions.set(pin, {
    pin,
    code,
    createdAt: Date.now(),
    approvedUserId: null,
    tokens: null,
  });

  res.json({
    pin,
    code,
    expires_in_seconds: 300,
  });
}

// GET /auth/pairing/check?pin=... — polled by extension
export async function checkPairing(req: Request, res: Response): Promise<void> {
  const pin = req.query.pin as string;

  if (!pin) {
    throw new AppError('pin is required', 400, 'VALIDATION_ERROR');
  }

  const session = pairingSessions.get(pin);
  if (!session) {
    throw new AppError('Pairing session expired or not found', 404, 'NOT_FOUND');
  }

  if (session.tokens) {
    pairingSessions.delete(pin);
    res.json({
      approved: true,
      ...session.tokens,
    });
    return;
  }

  res.json({ approved: false });
}

// POST /auth/pairing/approve — called by mobile when QR is scanned or PIN is entered
export async function approvePairing(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  let { pin, code } = req.body;

  if (!pin && code) {
    if (typeof code === 'string' && code.startsWith('focussive:pair:')) {
      pin = code.replace('focussive:pair:', '').trim();
    } else {
      pin = String(code).trim();
    }
  }

  if (!pin) {
    throw new AppError('Pairing PIN or code is required', 400, 'VALIDATION_ERROR');
  }

  const session = pairingSessions.get(String(pin));
  if (!session) {
    throw new AppError('Invalid or expired pairing code', 400, 'INVALID_PAIRING_CODE');
  }

  // Register extension device for this user
  const deviceId = await registerExtensionDevice(userId, req);
  const tokens = generateTokens(userId);

  session.approvedUserId = userId;
  session.tokens = {
    ...tokens,
    device_id: deviceId,
  };

  res.json({
    success: true,
    message: 'Extension paired successfully',
    device_id: deviceId,
  });
}

