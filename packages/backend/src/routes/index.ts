// ============================================================
// Focussive Backend — Route Index
// ============================================================

import { Router } from 'express';
import authRoutes from './auth.js';
import userRoutes from './user.js';
import appGroupRoutes from './appGroups.js';
import websiteGroupRoutes from './websiteGroups.js';
import sessionRoutes from './sessions.js';
import historyRoutes from './history.js';
import violationRoutes from './violations.js';
import deviceRoutes from './devices.js';

const router = Router();

// Mount all routes
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/app-groups', appGroupRoutes);
router.use('/website-groups', websiteGroupRoutes);
router.use('/sessions', sessionRoutes);
router.use('/history', historyRoutes);
router.use('/violations', violationRoutes);
router.use('/devices', deviceRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
