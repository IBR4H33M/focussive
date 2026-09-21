-- ============================================================
-- Focussive — Gamification, Quality Tiers & Badges Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Ensure all core session_history columns exist (for older database schemas)
ALTER TABLE session_history
  ADD COLUMN IF NOT EXISTS session_name VARCHAR(255) DEFAULT 'Focus Session',
  ADD COLUMN IF NOT EXISTS start_time VARCHAR(10) DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS end_time VARCHAR(10),
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS violations_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS app_violations_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS web_violations_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 2. Add new gamification columns to session_history table
ALTER TABLE session_history
  ADD COLUMN IF NOT EXISTS quality_tier VARCHAR(20) DEFAULT 'common',
  ADD COLUMN IF NOT EXISTS breaks_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emergency_breaks_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_on_schedule BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS blocked_apps TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS apps_count INTEGER DEFAULT 0;

-- 3. Add active_archetype and earned_badges to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_archetype VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS earned_badges JSONB DEFAULT '{}'::jsonb;

-- 4. Calculate total violations_count from app + web violations if null or 0
UPDATE session_history
SET violations_count = COALESCE(app_violations_count, 0) + COALESCE(web_violations_count, 0)
WHERE violations_count = 0 OR violations_count IS NULL;

-- 5. Backfill breaks_count and emergency_breaks_count from session_breaks (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'session_breaks') THEN
    UPDATE session_history sh
    SET 
      breaks_count = COALESCE(sub.total_breaks, 0),
      emergency_breaks_count = COALESCE(sub.emerg_breaks, 0)
    FROM (
      SELECT 
        session_id,
        COUNT(*) AS total_breaks,
        COUNT(*) FILTER (WHERE source = 'violation') AS emerg_breaks
      FROM session_breaks
      GROUP BY session_id
    ) sub
    WHERE sh.session_id = sub.session_id;
  END IF;
END $$;

-- 6. Backfill quality_tier for past completed sessions
UPDATE session_history
SET quality_tier = CASE
  WHEN (violations_count = 0 OR violations_count IS NULL)
       AND COALESCE(emergency_breaks_count, 0) = 0
       AND COALESCE(actual_duration, scheduled_duration, 0) >= 60
       AND COALESCE(is_on_schedule, true) = true THEN 'legendary'
  WHEN (violations_count = 0 OR violations_count IS NULL)
       AND COALESCE(emergency_breaks_count, 0) = 0 THEN 'epic'
  WHEN (violations_count = 0 OR violations_count IS NULL) THEN 'rare'
  WHEN violations_count <= 1 THEN 'uncommon'
  ELSE 'common'
END
WHERE status = 'completed' OR status IS NULL;

-- Set cancelled sessions to NULL quality_tier
UPDATE session_history
SET quality_tier = NULL
WHERE status = 'cancelled';

-- 7. Create indices for fast query performance
CREATE INDEX IF NOT EXISTS idx_session_history_quality_tier ON session_history(quality_tier);
CREATE INDEX IF NOT EXISTS idx_session_history_user_status_created ON session_history(user_id, status, created_at DESC);
