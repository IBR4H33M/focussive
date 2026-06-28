-- ============================================================
-- Focussive — Database Schema (Supabase PostgreSQL)
-- ============================================================
-- Run this in the Supabase SQL Editor to create all tables.
-- RLS (Row Level Security) is enabled on all tables.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  age INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  duration INTEGER NOT NULL, -- minutes
  schedule VARCHAR(50) NOT NULL DEFAULT 'today',
  schedule_days TEXT[] DEFAULT '{}',
  start_time VARCHAR(10) NOT NULL, -- HH:mm format
  mobile_focus BOOLEAN DEFAULT FALSE,
  browser_focus BOOLEAN DEFAULT FALSE,
  app_group_id UUID,
  blocked_websites TEXT[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'scheduled',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);

-- ============================================================
-- VIOLATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_name VARCHAR(255),
  website_name VARCHAR(255),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER DEFAULT 0,
  action_taken VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_violations_session_id ON violations(session_id);
CREATE INDEX IF NOT EXISTS idx_violations_user_id ON violations(user_id);

-- ============================================================
-- APP GROUPS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS app_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  apps JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_groups_user_id ON app_groups(user_id);

-- ============================================================
-- DEVICES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_type VARCHAR(50) NOT NULL, -- 'mobile' | 'extension'
  device_token VARCHAR(500),
  device_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

-- ============================================================
-- QR CODES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_codes_code ON qr_codes(code);
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_id ON qr_codes(user_id);

-- ============================================================
-- SESSION HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS session_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_name VARCHAR(255) NOT NULL,
  scheduled_duration INTEGER NOT NULL,
  actual_duration INTEGER,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10),
  status VARCHAR(50) NOT NULL,
  violations_count INTEGER DEFAULT 0,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_history_user_id ON session_history(user_id);
CREATE INDEX IF NOT EXISTS idx_session_history_session_id ON session_history(session_id);

-- ============================================================
-- SESSION ALLOWLIST TABLE (for "Mark as necessary" during session)
-- ============================================================
CREATE TABLE IF NOT EXISTS session_allowlist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  app_name VARCHAR(255),
  website_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_allowlist_session_id ON session_allowlist(session_id);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_groups_updated_at
  BEFORE UPDATE ON app_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_allowlist ENABLE ROW LEVEL SECURITY;

-- Since we use a service role key from the backend, RLS policies
-- allow the backend to bypass RLS. These policies are for direct
-- client access if ever needed.

-- Users can only access their own data
CREATE POLICY users_policy ON users
  FOR ALL USING (id = auth.uid());

CREATE POLICY sessions_policy ON sessions
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY violations_policy ON violations
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY app_groups_policy ON app_groups
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY devices_policy ON devices
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY qr_codes_policy ON qr_codes
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY session_history_policy ON session_history
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY session_allowlist_policy ON session_allowlist
  FOR ALL USING (
    session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid())
  );
