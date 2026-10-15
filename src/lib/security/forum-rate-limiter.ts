import { AppError } from '@/lib/errors';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const discussionLimiter = new Map<string, RateLimitEntry>();
const replyLimiter = new Map<string, RateLimitEntry>();

const DISCUSSION_MAX = 5;
const DISCUSSION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const REPLY_MAX = 15;
const REPLY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkLimiter(
  store: Map<string, RateLimitEntry>,
  key: string,
  max: number,
  windowMs: number,
  actionName: string
) {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (entry.count >= max) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    throw new AppError(
      `Rate limit exceeded for ${actionName}. Please wait ${retryAfterSec} seconds before trying again.`,
      429,
      'RATE_LIMIT_EXCEEDED',
      { retryAfter: retryAfterSec }
    );
  }

  entry.count += 1;
}

export function checkDiscussionRateLimit(identifier: string) {
  checkLimiter(discussionLimiter, identifier, DISCUSSION_MAX, DISCUSSION_WINDOW_MS, 'creating discussions');
}

export function checkReplyRateLimit(identifier: string) {
  checkLimiter(replyLimiter, identifier, REPLY_MAX, REPLY_WINDOW_MS, 'posting replies');
}

export function clearForumRateLimits() {
  discussionLimiter.clear();
  replyLimiter.clear();
}

export { clearForumRateLimits as _resetForumRateLimitsForTesting };
