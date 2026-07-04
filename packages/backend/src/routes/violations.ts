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
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authMiddleware);

router.post('/', asyncHandler(createViolation));
router.get('/stats', asyncHandler(getViolationStats));

export default router;

// Session-scoped violation route is mounted in sessions router
export { getSessionViolations };
