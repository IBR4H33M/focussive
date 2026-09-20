// ============================================================
// Focussive Backend — User Routes
// ============================================================

import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  updatePassword,
  deleteAccount,
  getSubscription,
  startTrial,
  syncSubscriptionController,
} from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authMiddleware);

router.get('/profile', asyncHandler(getProfile));
router.put('/profile', asyncHandler(updateProfile));
router.put('/password', asyncHandler(updatePassword));
router.delete('/account', asyncHandler(deleteAccount));

// Subscription & 3-week Free Trial
router.get('/subscription', asyncHandler(getSubscription));
router.post('/trial/start', asyncHandler(startTrial));
router.post('/subscription/sync', asyncHandler(syncSubscriptionController));

export default router;
