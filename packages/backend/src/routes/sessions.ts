// ============================================================
// Focussive Backend — Session Routes
// ============================================================

import { Router } from 'express';
import {
  getSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  cancelSession,
  startSession,
  getActiveSessions,
  getUpcomingSessions,
  startBreak,
  endBreak,
} from '../controllers/sessionController.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// All session routes are protected
router.use(authMiddleware);

// Specific routes before parameterized routes
router.get('/active', asyncHandler(getActiveSessions));
router.get('/upcoming', asyncHandler(getUpcomingSessions));

router.get('/', asyncHandler(getSessions));
router.get('/:id', asyncHandler(getSession));
router.post('/', asyncHandler(createSession));
router.put('/:id', asyncHandler(updateSession));
router.delete('/:id', asyncHandler(deleteSession));
router.post('/:id/cancel', asyncHandler(cancelSession));
router.post('/:id/start', asyncHandler(startSession));
router.post('/:id/break/start', asyncHandler(startBreak));
router.post('/:id/break/end', asyncHandler(endBreak));

export default router;
