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
import websiteGroupRoutes from './routes/websiteGroups.js';
import { getSessionViolations } from './routes/violations.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import supabase from './config/supabase.js';
import { v4 as uuidv4 } from 'uuid';

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
app.use('/website-groups', websiteGroupRoutes);

// Session-scoped violations route
app.get('/sessions/:id/violations', authMiddleware, getSessionViolations);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Error Handling ----

app.use(errorHandler);

// ============================================================
// SESSION SCHEDULER — runs every 60s
// Activates sessions whose start_time has arrived,
// and completes sessions whose time has expired.
// ============================================================

async function runSessionScheduler() {
  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayDay = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][now.getDay()];

    // ---- 1. Activate due SCHEDULED sessions ----
    const { data: scheduled } = await supabase
      .from('sessions')
      .select('*')
      .eq('status', 'scheduled');

    for (const session of scheduled || []) {
      const [h, m] = session.start_time.split(':').map(Number);
      const sessionStartMinutes = h * 60 + m;
      const sessionEndMinutes = sessionStartMinutes + session.duration;

      // Determine if session should be active today
      let isToday = false;
      if (session.schedule === 'today') {
        isToday = true;
      } else if (session.schedule === 'recurring') {
        // schedule_days contains weekday strings for recurring
        isToday = session.schedule_days?.includes(todayDay) ?? false;
      } else if (session.schedule === 'scheduled') {
        // schedule_days contains ISO date strings like '2026-07-01'
        const todayISO = now.toISOString().slice(0, 10);
        isToday = session.schedule_days?.includes(todayISO) ?? false;
      }

      if (!isToday) continue;

      // Activate only if within the session's time window
      if (currentMinutes >= sessionStartMinutes && currentMinutes < sessionEndMinutes) {
        await supabase
          .from('sessions')
          .update({ status: 'active', started_at: now.toISOString() })
          .eq('id', session.id);
        console.log(`[Scheduler] Activated session "${session.name}" (${session.id})`);      }
      // If window has passed, do NOT auto-delete — user may have created it for a future date
      // They can delete/edit it manually
    }

    // ---- 2. Complete expired ACTIVE/paused sessions ----
    const { data: active } = await supabase
      .from('sessions')
      .select('*')
      .in('status', ['active', 'paused']);

    for (const session of active || []) {
      if (!session.started_at) continue;

      const startedAt = new Date(session.started_at).getTime();
      const elapsedMinutes = (Date.now() - startedAt) / 60000;

      if (elapsedMinutes >= session.duration) {
        const completedAt = now.toISOString();

        const { count: violationsCount } = await supabase
          .from('violations')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', session.id);

        if (session.schedule === 'recurring') {
          // Recurring: log history entry then RESET to scheduled for tomorrow
          await supabase.from('session_history').insert({
            id: uuidv4(),
            session_id: session.id,
            user_id: session.user_id,
            session_name: session.name,
            scheduled_duration: session.duration,
            actual_duration: session.duration,
            start_time: session.start_time,
            status: 'completed',
            violations_count: violationsCount || 0,
            pause_count: session.pause_count || 0,
          });
          // Reset back to scheduled so it activates again tomorrow
          await supabase
            .from('sessions')
            .update({ status: 'scheduled', started_at: null, completed_at: null, pause_count: 0 })
            .eq('id', session.id);
          console.log(`[Scheduler] Recurring session "${session.name}" completed for today — reset for tomorrow`);
        } else {
          // Today/Scheduled: mark permanently completed
          await supabase
            .from('sessions')
            .update({ status: 'completed', completed_at: completedAt })
            .eq('id', session.id);
          await supabase.from('session_history').insert({
            id: uuidv4(),
            session_id: session.id,
            user_id: session.user_id,
            session_name: session.name,
            scheduled_duration: session.duration,
            actual_duration: session.duration,
            start_time: session.start_time,
            status: 'completed',
            violations_count: violationsCount || 0,
            pause_count: session.pause_count || 0,
          });
          console.log(`[Scheduler] Completed session "${session.name}" (${session.id})`);
        }
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error:', err);
  }
}

// ---- Start Server ----

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🟢 Focussive backend running on http://0.0.0.0:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

  // Run immediately on start, then every 60 seconds
  runSessionScheduler();
  setInterval(runSessionScheduler, 60 * 1000);
  console.log('⏰ Session scheduler started (runs every 60s)');
});

export default app;

