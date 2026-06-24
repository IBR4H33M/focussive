// ============================================================
// Focussive Backend — Auth Routes
// ============================================================

import { Router } from 'express';
import { signup, login, qrGenerate, qrLogin, verify } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/qr-login', qrLogin);
router.post('/qr-generate', authMiddleware, qrGenerate);
router.get('/verify', authMiddleware, verify);

export default router;
