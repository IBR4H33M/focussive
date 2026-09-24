// ============================================================
// Focussive Backend — Auth Routes
// ============================================================

import { Router } from 'express';
import {
  signup,
  login,
  verifyEmail,
  resendVerificationCode,
  qrGenerate,
  qrLogin,
  verify,
  refreshToken,
  startPairing,
  checkPairing,
  approvePairing,
} from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/signup', asyncHandler(signup));
router.post('/login', asyncHandler(login));
router.post('/verify-email', asyncHandler(verifyEmail));
router.post('/resend-code', asyncHandler(resendVerificationCode));
router.post('/qr-login', asyncHandler(qrLogin));
router.post('/qr-generate', authMiddleware, asyncHandler(qrGenerate));
router.get('/verify', authMiddleware, asyncHandler(verify));
router.post('/refresh', asyncHandler(refreshToken));

// Extension Direct Pairing
router.post('/pairing/start', asyncHandler(startPairing));
router.get('/pairing/check', asyncHandler(checkPairing));
router.post('/pairing/approve', authMiddleware, asyncHandler(approvePairing));

export default router;
