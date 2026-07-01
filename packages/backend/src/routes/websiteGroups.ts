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

const router = Router();
router.use(authMiddleware);

router.get('/', getWebsiteGroups);
router.post('/', createWebsiteGroup);
router.put('/:id', updateWebsiteGroup);
router.delete('/:id', deleteWebsiteGroup);

export default router;
