// ============================================================
// Focussive Backend — Violation Routes
// ============================================================

import { Router } from 'express';
import {
  createViolation,
  getSessionViolations,
  getViolationStats,
} from '../controllers/violationController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

router.post('/', createViolation);
router.get('/stats', getViolationStats);

export default router;

// Session-scoped violation route is mounted in sessions router
export { getSessionViolations };
