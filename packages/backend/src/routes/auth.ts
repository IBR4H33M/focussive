// ============================================================
// Focussive Backend — Auth Routes
// ============================================================

import { Router } from 'express';
import { signup, login, qrGenerate, qrLogin, verify, refreshToken } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/signup', asyncHandler(signup));
router.post('/login', asyncHandler(login));
router.post('/qr-login', asyncHandler(qrLogin));
router.post('/qr-generate', authMiddleware, asyncHandler(qrGenerate));
router.get('/verify', authMiddleware, asyncHandler(verify));
router.post('/refresh', asyncHandler(refreshToken));

export default router;
