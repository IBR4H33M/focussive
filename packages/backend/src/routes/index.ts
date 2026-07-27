// ============================================================
// Focussive Backend — Route Index
// ============================================================

import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './user';
import appGroupRoutes from './appGroups';
import websiteGroupRoutes from './websiteGroups';
import sessionRoutes from './sessions';
import historyRoutes from './history';
import violationRoutes from './violations';
import deviceRoutes from './devices';

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
