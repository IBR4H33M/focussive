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
} from '../controllers/appGroupController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/apps', getAvailableApps);
router.get('/', getAppGroups);
router.post('/', createAppGroup);
router.put('/:id', updateAppGroup);
router.delete('/:id', deleteAppGroup);

export default router;
