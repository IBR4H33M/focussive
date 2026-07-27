// ============================================================
// Focussive Backend — App Group Routes
// ============================================================

import { Router } from 'express';
import {
  getAppGroups,
  createAppGroup,
  updateAppGroup,
  deleteAppGroup,
  getAvailableApps,
} from '../controllers/appGroupController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authMiddleware);

router.get('/apps', asyncHandler(getAvailableApps));
router.get('/', asyncHandler(getAppGroups));
router.post('/', asyncHandler(createAppGroup));
router.put('/:id', asyncHandler(updateAppGroup));
router.delete('/:id', asyncHandler(deleteAppGroup));

export default router;
