/** Maximum number of searches + outreach messages per user per day */
export const DAILY_LIMIT = 2;

/**
 * Set to true before deploying to enable Google OAuth + per-user rate limiting.
 * When true: BOTH /api/search and /api/generate require sign-in and count against DAILY_LIMIT.
 * When false: everything works for anyone, no sign-in required, no usage tracking.
 */
export const AUTH_ENABLED = true;

/**
 * Returns true if the given email belongs to an admin.
 * Admins bypass all rate limits entirely.
 * Set ADMIN_EMAILS in your env as a comma-separated list:
 *   ADMIN_EMAILS=bosekrishang@gmail.com
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}
