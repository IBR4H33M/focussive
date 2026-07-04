// ============================================================
// Focussive Backend — Website Group Routes
// ============================================================

import { Router } from 'express';
import {
  getWebsiteGroups,
  createWebsiteGroup,
  updateWebsiteGroup,
  deleteWebsiteGroup,
} from '../controllers/websiteGroupController.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(getWebsiteGroups));
router.post('/', asyncHandler(createWebsiteGroup));
router.put('/:id', asyncHandler(updateWebsiteGroup));
router.delete('/:id', asyncHandler(deleteWebsiteGroup));

export default router;
