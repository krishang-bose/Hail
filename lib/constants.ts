/** Maximum number of searches + outreach messages per user per day */
export const DAILY_LIMIT = 2;

/**
 * Controls whether Google OAuth + rate limiting is enforced.
 * Reads from AUTH_ENABLED env var — set to 'false' in .env.local to disable locally.
 * On Vercel (production), set AUTH_ENABLED=true in Environment Variables.
 * Defaults to true if the env var is not set (safe for production).
 */
export const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';

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
