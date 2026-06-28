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

const router = Router();

router.use(authMiddleware);

router.get('/', getHistory);
router.delete('/', deleteAllHistory);
router.post('/export', exportHistory);
router.get('/:id', getHistoryDetail);
router.delete('/:id', deleteHistoryEntry);

export default router;

