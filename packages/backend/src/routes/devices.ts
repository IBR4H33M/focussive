// ============================================================
// Focussive Backend — Device Routes
// ============================================================

import { Router } from 'express';
import { registerDevice, removeDevice } from '../controllers/deviceController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.post('/register', registerDevice);
router.delete('/:id', removeDevice);

export default router;
