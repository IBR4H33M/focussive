// ============================================================
// Focussive Backend — Rate Limiting Middleware
// ============================================================

import rateLimit from 'express-rate-limit';

const isDevelopment = process.env.NODE_ENV !== 'production';

// A plain-string `message` makes express-rate-limit reply with text/plain.
// Clients here always JSON.parse the body, so a 429 surfaced as an opaque
// "Failed to parse JSON response" instead of a readable rate-limit error.
// Every limiter below returns the same { error, code } shape as the rest of
// the API.
const jsonMessage = (error: string, code: string) => ({ error, code });

// General API rate limiter - More permissive in development
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : 600, // 600 in production
  message: jsonMessage(
    'Too many requests, please try again later.',
    'RATE_LIMITED'
  ),
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limiter for auth endpoints - More permissive in development
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 20, // 20 in production
  message: jsonMessage(
    'Too many authentication attempts, please try again later.',
    'AUTH_RATE_LIMITED'
  ),
  standardHeaders: true,
  legacyHeaders: false,
  // Only failed attempts should count, so a successful login doesn't burn
  // the budget a genuinely locked-out user needs.
  skipSuccessfulRequests: true,
});
