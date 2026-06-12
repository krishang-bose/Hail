-- Hail — Auth & rate-limiting schema
-- Run this in the Supabase SQL Editor after 001_init.sql

-- ── Users ────────────────────────────────────────────────────────────────────
-- Synced from Google OAuth on first sign-in
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  avatar_url  TEXT,
  google_id   TEXT UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Daily usage ───────────────────────────────────────────────────────────────
-- One row per (user, date). calls increments on each /api/generate hit.
CREATE TABLE IF NOT EXISTS usage (
  id       UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id  UUID    REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  date     DATE    NOT NULL DEFAULT CURRENT_DATE,
  calls    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage(user_id, date);

-- ── RLS (service role bypasses anyway) ───────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on usage" ON usage FOR ALL USING (true) WITH CHECK (true);

-- ── Atomic increment RPC ──────────────────────────────────────────────────────
-- Called by lib/ratelimit.ts incrementUsage()
-- Inserts a row for today if missing, then increments calls by 1
CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID, p_date DATE)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO usage (user_id, date, calls)
    VALUES (p_user_id, p_date, 1)
  ON CONFLICT (user_id, date)
    DO UPDATE SET calls = usage.calls + 1;
END;
$$;
