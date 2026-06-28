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
  pauseSession,
  getActiveSessions,
  getUpcomingSessions,
} from '../controllers/sessionController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// All session routes are protected
router.use(authMiddleware);

// Specific routes before parameterized routes
router.get('/active', getActiveSessions);
router.get('/upcoming', getUpcomingSessions);

router.get('/', getSessions);
router.get('/:id', getSession);
router.post('/', createSession);
router.put('/:id', updateSession);
router.delete('/:id', deleteSession);
router.post('/:id/cancel', cancelSession);
router.post('/:id/pause', pauseSession);

export default router;

