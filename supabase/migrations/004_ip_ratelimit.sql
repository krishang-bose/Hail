-- Hail — IP-based rate limiting for anonymous users
-- Run in Supabase SQL Editor

-- One row per (ip_hash, date). Anonymous users get DAILY_LIMIT searches before sign-in is required.
CREATE TABLE IF NOT EXISTS ip_usage (
  id       UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_hash  TEXT    NOT NULL,          -- SHA-256 of real IP (never store raw IPs)
  date     DATE    NOT NULL DEFAULT CURRENT_DATE,
  calls    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (ip_hash, date)
);

CREATE INDEX IF NOT EXISTS idx_ip_usage_hash_date ON ip_usage(ip_hash, date);

-- RLS — service role bypasses anyway
ALTER TABLE ip_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on ip_usage" ON ip_usage FOR ALL USING (true) WITH CHECK (true);

-- Atomic increment for anonymous IP usage
CREATE OR REPLACE FUNCTION increment_ip_usage(p_ip_hash TEXT, p_date DATE)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ip_usage (ip_hash, date, calls)
    VALUES (p_ip_hash, p_date, 1)
  ON CONFLICT (ip_hash, date)
    DO UPDATE SET calls = ip_usage.calls + 1;
END;
$$;
