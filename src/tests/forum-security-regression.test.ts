import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { forumDiscussionSchema, forumReplySchema } from '@/lib/validations/forum.schemas';
import {
  checkDiscussionRateLimit,
  checkReplyRateLimit,
  clearForumRateLimits,
} from '@/lib/security/forum-rate-limiter';
import { POST as createDiscussionRoute } from '@/app/api/forum/discussions/route';
import { POST as createReplyRoute } from '@/app/api/forum/discussions/[id]/replies/route';
import { AuthService } from '@/services/auth.service';
import { ForumService } from '@/services/forum.service';

vi.mock('@/services/auth.service', () => ({
  AuthService: {
    getCurrentUser: vi.fn(),
  },
}));

vi.mock('@/services/forum.service', () => ({
  ForumService: {
    createDiscussion: vi.fn(),
    createPost: vi.fn(),
  },
}));

describe('Forum Security & Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearForumRateLimits();
  });

  describe('1. Input Validation Schemas', () => {
    const validUuid = '11111111-2222-4333-8444-555555555555';

    it('rejects discussion titles that are too short or too long', () => {
      const shortResult = forumDiscussionSchema.safeParse({
        categoryId: validUuid,
        title: 'ab',
        body: 'Valid body text for discussion',
      });
      expect(shortResult.success).toBe(false);

      const longTitle = 'a'.repeat(151);
      const longResult = forumDiscussionSchema.safeParse({
        categoryId: validUuid,
        title: longTitle,
        body: 'Valid body text for discussion',
      });
      expect(longResult.success).toBe(false);
    });

    it('rejects discussion bodies that are too short or exceed 20,000 characters', () => {
      const shortResult = forumDiscussionSchema.safeParse({
        categoryId: validUuid,
        title: 'Valid Discussion Title',
        body: '1234',
      });
      expect(shortResult.success).toBe(false);

      const hugeBody = 'x'.repeat(20001);
      const hugeResult = forumDiscussionSchema.safeParse({
        categoryId: validUuid,
        title: 'Valid Discussion Title',
        body: hugeBody,
      });
      expect(hugeResult.success).toBe(false);
    });

    it('rejects invalid categoryId format', () => {
      const invalidCat = forumDiscussionSchema.safeParse({
        categoryId: 'not-a-uuid',
        title: 'Valid Discussion Title',
        body: 'Valid discussion body content',
      });
      expect(invalidCat.success).toBe(false);
    });

    it('accepts valid discussion inputs and strips extra whitespaces', () => {
      const valid = forumDiscussionSchema.safeParse({
        categoryId: validUuid,
        title: '  SAP CPI Groovy Scripting Best Practices  ',
        body: '  How do you manage script headers in large iFlows?  ',
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.title).toBe('SAP CPI Groovy Scripting Best Practices');
        expect(valid.data.body).toBe('How do you manage script headers in large iFlows?');
      }
    });

    it('validates forum reply schema properly', () => {
      const emptyReply = forumReplySchema.safeParse({ body: '' });
      expect(emptyReply.success).toBe(false);

      const oversizedReply = forumReplySchema.safeParse({ body: 'y'.repeat(10001) });
      expect(oversizedReply.success).toBe(false);

      const validReply = forumReplySchema.safeParse({ body: 'You can use message.setProperty() safely.' });
      expect(validReply.success).toBe(true);
    });
  });

  describe('2. Abuse & Rate Limiting Protection', () => {
    it('allows up to 5 discussions per 10-minute window then throws 429 AppError', () => {
      const userId = 'user-discussion-spammer';

      for (let i = 0; i < 5; i++) {
        expect(() => checkDiscussionRateLimit(userId)).not.toThrow();
      }

      expect(() => checkDiscussionRateLimit(userId)).toThrowError(/Rate limit exceeded/);
    });

    it('allows up to 15 replies per 5-minute window then throws 429 AppError', () => {
      const userId = 'user-reply-spammer';

      for (let i = 0; i < 15; i++) {
        expect(() => checkReplyRateLimit(userId)).not.toThrow();
      }

      expect(() => checkReplyRateLimit(userId)).toThrowError(/Rate limit exceeded/);
    });

    it('isolates rate limits between separate users', () => {
      const userA = 'user-a';
      const userB = 'user-b';

      for (let i = 0; i < 5; i++) {
        expect(() => checkDiscussionRateLimit(userA)).not.toThrow();
      }
      expect(() => checkDiscussionRateLimit(userA)).toThrowError();

      // User B should still be allowed
      expect(() => checkDiscussionRateLimit(userB)).not.toThrow();
    });
  });

  describe('3. Route-Level Authorization & Security Invariants', () => {
    const validUuid = '11111111-2222-4333-8444-555555555555';

    it('POST /api/forum/discussions returns 401 when unauthenticated', async () => {
      (AuthService.getCurrentUser as unknown as import('vitest').Mock).mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/forum/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: validUuid,
          title: 'Unauthorized Topic',
          body: 'This should not be posted',
        }),
      });

      const res = await createDiscussionRoute(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe('UNAUTHORIZED');
      expect(ForumService.createDiscussion).not.toHaveBeenCalled();
    });

    it('POST /api/forum/discussions returns 400 when body fails schema validation', async () => {
      (AuthService.getCurrentUser as unknown as import('vitest').Mock).mockResolvedValue({
        id: 'auth-user-1',
        email: 'user1@example.com',
      });

      const req = new NextRequest('http://localhost:3000/api/forum/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: 'invalid-cat',
          title: 'Hi',
          body: 'short',
        }),
      });

      const res = await createDiscussionRoute(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.details).toBeDefined();
      expect(ForumService.createDiscussion).not.toHaveBeenCalled();
    });

    it('POST /api/forum/discussions creates discussion with authenticated user ID', async () => {
      (AuthService.getCurrentUser as unknown as import('vitest').Mock).mockResolvedValue({
        id: 'auth-user-1',
        email: 'user1@example.com',
      });
      (ForumService.createDiscussion as unknown as import('vitest').Mock).mockResolvedValue({
        id: 'disc-created-123',
        title: 'Valid Discussion',
      });

      const req = new NextRequest('http://localhost:3000/api/forum/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: validUuid,
          title: 'Valid Discussion Title',
          body: 'Valid discussion body describing an architectural pattern',
        }),
      });

      const res = await createDiscussionRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.id).toBe('disc-created-123');
      expect(ForumService.createDiscussion).toHaveBeenCalledWith({
        categoryId: validUuid,
        title: 'Valid Discussion Title',
        body: 'Valid discussion body describing an architectural pattern',
        authorId: 'auth-user-1',
      });
    });

    it('POST /api/forum/discussions returns 429 when rate limit is exceeded', async () => {
      (AuthService.getCurrentUser as unknown as import('vitest').Mock).mockResolvedValue({
        id: 'spammer-user-id',
        email: 'spammer@example.com',
      });

      // Exhaust limit
      for (let i = 0; i < 5; i++) {
        checkDiscussionRateLimit('spammer-user-id');
      }

      const req = new NextRequest('http://localhost:3000/api/forum/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: validUuid,
          title: 'Spam Discussion Title',
          body: 'Spam discussion body content goes here',
        }),
      });

      const res = await createDiscussionRoute(req);
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(ForumService.createDiscussion).not.toHaveBeenCalled();
    });

    const validDiscussionId = '55555555-5555-4555-8555-555555555555';

    it('POST /api/forum/discussions/[id]/replies returns 401 when unauthenticated', async () => {
      (AuthService.getCurrentUser as unknown as import('vitest').Mock).mockResolvedValue(null);

      const req = new NextRequest(`http://localhost:3000/api/forum/discussions/${validDiscussionId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Unauthorized reply' }),
      });

      const res = await createReplyRoute(req, {
        params: Promise.resolve({ id: validDiscussionId }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe('UNAUTHORIZED');
      expect(ForumService.createPost).not.toHaveBeenCalled();
    });

    it('POST /api/forum/discussions/[id]/replies creates reply with authenticated authorId', async () => {
      (AuthService.getCurrentUser as unknown as import('vitest').Mock).mockResolvedValue({
        id: 'reply-user-7',
        email: 'reply@example.com',
      });
      (ForumService.createPost as unknown as import('vitest').Mock).mockResolvedValue({
        id: 'post-101',
        body: 'Helpful answer about OAuth token caching',
      });

      const req = new NextRequest(`http://localhost:3000/api/forum/discussions/${validDiscussionId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Helpful answer about OAuth token caching' }),
      });

      const res = await createReplyRoute(req, {
        params: Promise.resolve({ id: validDiscussionId }),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.id).toBe('post-101');
      expect(ForumService.createPost).toHaveBeenCalledWith({
        discussionId: validDiscussionId,
        authorId: 'reply-user-7',
        body: 'Helpful answer about OAuth token caching',
      });
    });
  });
});
