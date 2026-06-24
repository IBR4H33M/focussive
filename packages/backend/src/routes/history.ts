// ============================================================
// Focussive Backend — History Routes
// ============================================================

import { Router } from 'express';
import {
  getHistory,
  getHistoryDetail,
  exportHistory,
} from '../controllers/historyController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getHistory);
router.post('/export', exportHistory);
router.get('/:id', getHistoryDetail);

export default router;
