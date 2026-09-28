-- ============================================================
-- Focussive — Migration: Create website_groups table
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Create the website_groups table
CREATE TABLE IF NOT EXISTS website_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  websites TEXT[] DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_groups_user_id ON website_groups(user_id);

-- Enable RLS
ALTER TABLE website_groups ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access their own website groups
DROP POLICY IF EXISTS website_groups_policy ON website_groups;
CREATE POLICY website_groups_policy ON website_groups
  FOR ALL USING (user_id = auth.uid());

-- Updated_at trigger
CREATE TRIGGER update_website_groups_updated_at
  BEFORE UPDATE ON website_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Cleanup: Remove duplicate session_history entries
-- This de-duplicates any existing duplicates caused by the
-- scheduler bug (re-activating + re-completing sessions within
-- the same time window). Keeps the first entry per session per
-- day.
-- ============================================================
DELETE FROM session_history
WHERE id NOT IN (
  SELECT DISTINCT ON (session_id, DATE(created_at)) id
  FROM session_history
  ORDER BY session_id, DATE(created_at), created_at ASC
);
