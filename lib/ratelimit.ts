import { supabaseAdmin } from '@/lib/supabase';
import { DAILY_LIMIT } from '@/lib/constants';

export { DAILY_LIMIT };

/**
 * Check whether a user is under their daily generate limit.
 * Returns { allowed, used, limit } — does NOT increment.
 */
export async function checkDailyLimit(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

  const { data, error } = await supabaseAdmin
    .from('usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle();

  if (error) {
    console.error('[RateLimit] checkDailyLimit error:', error.message);
    // Fail open — don't block user if DB has a transient issue
    return { allowed: true, used: 0, limit: DAILY_LIMIT };
  }

  const used = data?.calls ?? 0;
  return { allowed: used < DAILY_LIMIT, used, limit: DAILY_LIMIT };
}

/**
 * Atomically increment today's call count for a user.
 * Uses the increment_usage Postgres function (see 002_auth.sql).
 */
export async function incrementUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabaseAdmin.rpc('increment_usage', {
    p_user_id: userId,
    p_date:    today,
  });

  if (error) {
    console.error('[RateLimit] incrementUsage error:', error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IP-based rate limiting — for anonymous (not signed-in) users
// IP is SHA-256 hashed before storage so we never store raw IP addresses.
// ─────────────────────────────────────────────────────────────────────────────

/** SHA-256 hash of an IP address — privacy-safe storage */
export async function hashIp(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + (process.env.IP_HASH_SALT ?? 'hail-salt'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Extract the real client IP from Next.js request headers */
export function getClientIp(req: Request): string {
  const forwarded = (req.headers as any).get?.('x-forwarded-for')
    ?? (req.headers as any)['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return 'unknown';
}

/**
 * Check anonymous IP rate limit.
 * Returns { allowed, used, limit }.
 */
export async function checkIpLimit(ipHash: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin
    .from('ip_usage')
    .select('calls')
    .eq('ip_hash', ipHash)
    .eq('date', today)
    .maybeSingle();

  if (error) {
    console.error('[RateLimit] checkIpLimit error:', error.message);
    return { allowed: true, used: 0, limit: DAILY_LIMIT }; // fail open
  }

  const used = data?.calls ?? 0;
  return { allowed: used < DAILY_LIMIT, used, limit: DAILY_LIMIT };
}

/** Atomically increment today's call count for an IP hash */
export async function incrementIpUsage(ipHash: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabaseAdmin.rpc('increment_ip_usage', {
    p_ip_hash: ipHash,
    p_date:    today,
  });

  if (error) {
    console.error('[RateLimit] incrementIpUsage error:', error.message);
  }
}
