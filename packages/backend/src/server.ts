// ============================================================
// Focussive Backend — Express Server
// ============================================================

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import violationRoutes from './routes/violations.js';
import appGroupRoutes from './routes/appGroups.js';
import historyRoutes from './routes/history.js';
import userRoutes from './routes/user.js';
import deviceRoutes from './routes/devices.js';
import { getSessionViolations } from './routes/violations.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();
dotenv.config({ path: '../../.env' });

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ---- Middleware ----

// CORS
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) || [
  'http://localhost:8081',
  'http://localhost:19006',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      // Allow chrome extensions
      if (origin.startsWith('chrome-extension://')) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Rate limiting: 100 req/min per IP
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Too many requests', code: 'RATE_LIMITED' },
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Routes ----

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url}`);
  next();
});

app.use('/auth', authRoutes);
app.use('/sessions', sessionRoutes);
app.use('/violations', violationRoutes);
app.use('/app-groups', appGroupRoutes);
app.use('/history', historyRoutes);
app.use('/user', userRoutes);
app.use('/devices', deviceRoutes);

// Session-scoped violations route
app.get('/sessions/:id/violations', authMiddleware, getSessionViolations);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Error Handling ----

app.use(errorHandler);

// ---- Start Server ----

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🟢 Focussive backend running on http://0.0.0.0:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
