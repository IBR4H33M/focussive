// ============================================================
// Focussive Backend — History Routes
// ============================================================

import { Router } from 'express';
import {
  getHistory,
  getHistoryDetail,
  exportHistory,
  deleteHistoryEntry,
  deleteAllHistory,
} from '../controllers/historyController.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.get('/', asyncHandler(getHistory));
router.delete('/', asyncHandler(deleteAllHistory));
router.post('/export', asyncHandler(exportHistory));
router.get('/:id', asyncHandler(getHistoryDetail));
router.delete('/:id', asyncHandler(deleteHistoryEntry));

export default router;

