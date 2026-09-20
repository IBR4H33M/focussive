// ============================================================
// Focussive Backend — Auth Middleware (Clerk & Legacy Support)
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getAuth, clerkClient } from '@clerk/express';
import { v4 as uuidv4 } from 'uuid';
import supabase from '../config/supabase';

export interface AuthRequest extends Request {
  userId?: string;
}

interface JwtPayload {
  userId: string;
  iat: number;
  exp: number;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // 1. Check Clerk Auth first
  try {
    const auth = getAuth(req);
    if (auth && auth.userId) {
      const clerkUserId = auth.userId;

      // Check if user already exists in Supabase by clerk_id
      const { data: userByClerkId } = await supabase
        .from('users')
        .select('id')
        .eq('clerk_id', clerkUserId)
        .single();

      if (userByClerkId) {
        req.userId = userByClerkId.id;
        return next();
      }

      // If not found by clerk_id, fetch Clerk user details
      let email = `${clerkUserId}@clerk.user`;
      let name = 'Focussive User';
      let avatarUrl: string | null = null;

      try {
        const client = (req as unknown as { clerkClient?: typeof clerkClient }).clerkClient || clerkClient;
        const user = await client.users.getUser(clerkUserId);
        if (user.emailAddresses && user.emailAddresses.length > 0) {
          email = user.emailAddresses[0].emailAddress;
        }
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
        if (fullName) {
          name = fullName;
        } else if (user.username) {
          name = user.username;
        } else {
          name = email.split('@')[0];
        }
        if (user.imageUrl) {
          avatarUrl = user.imageUrl;
        }
      } catch (err) {
        console.warn('[Clerk Auth] Could not fetch user details from Clerk API:', err);
      }

      // Check if user exists by email (link existing account)
      const { data: userByEmail } = await supabase
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase())
        .single();

      if (userByEmail) {
        await supabase
          .from('users')
          .update({
            clerk_id: clerkUserId,
            avatar_url: avatarUrl || undefined,
            email_verified: true,
          })
          .eq('id', userByEmail.id);

        req.userId = userByEmail.id;
        return next();
      }

      // Insert new user into Supabase
      const newUserId = uuidv4();
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          id: newUserId,
          clerk_id: clerkUserId,
          email: email.toLowerCase(),
          name,
          avatar_url: avatarUrl,
          email_verified: true,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[Clerk Auth] Failed to insert new user into Supabase:', insertError);
      }

      req.userId = newUser?.id || newUserId;
      return next();
    }
  } catch {
    // Continue to legacy token check
  }

  // 2. Legacy JWT fallback
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided', code: 'UNAUTHORIZED' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Invalid token format', code: 'UNAUTHORIZED' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    res.status(401).json({ error: 'Invalid token', code: 'UNAUTHORIZED' });
  }
}
