// ============================================================
// Focussive Backend — Device Routes
// ============================================================

import { Router } from 'express';
import { registerDevice, removeDevice } from '../controllers/deviceController.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post('/register', asyncHandler(registerDevice));
router.delete('/:id', asyncHandler(removeDevice));

export default router;
