export const ACTIVITY_LOOKBACK_DAYS = 30;
export const COMMENT_PREVIEW_LENGTH = 500;
export const MAX_REPOS_PER_CONTRIBUTION = 100;

// SHORT: active/changing data (current month, org members)
// LONG: immutable/slow-changing data (past ranges, user orgs)
export const SHORT_CACHE_TTL = 15 * 60 * 1000;
export const LONG_CACHE_TTL = 24 * 60 * 60 * 1000;

// Months within this window are always re-fetched; older months are cached permanently in SQLite
export const CACHE_FRESHNESS_MONTHS = 1;
