// ============================================================
// Focussive Backend — Device Routes
// ============================================================

import { Router } from 'express';
import { registerDevice, removeDevice } from '../controllers/deviceController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authMiddleware);

router.post('/register', asyncHandler(registerDevice));
router.delete('/:id', asyncHandler(removeDevice));

export default router;
