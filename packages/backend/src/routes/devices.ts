// ============================================================
// Focussive Backend — Device Routes
// ============================================================

import { Router } from 'express';
import {
  registerDevice,
  listDevices,
  extensionStatus,
  heartbeat,
  removeDevice,
} from '../controllers/deviceController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authMiddleware);

router.get('/', asyncHandler(listDevices));
router.get('/extension/status', asyncHandler(extensionStatus));
router.post('/register', asyncHandler(registerDevice));
router.post('/heartbeat', asyncHandler(heartbeat));
router.delete('/:id', asyncHandler(removeDevice));

export default router;
