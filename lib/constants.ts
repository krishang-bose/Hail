/** Maximum number of searches + outreach messages per user per day */
export const DAILY_LIMIT = 2;

/**
 * Set to true before deploying to enable Google OAuth + per-user rate limiting.
 * When true: BOTH /api/search and /api/generate require sign-in and count against DAILY_LIMIT.
 * When false: everything works for anyone, no sign-in required, no usage tracking.
 */
export const AUTH_ENABLED = true;
