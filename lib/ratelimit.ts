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
