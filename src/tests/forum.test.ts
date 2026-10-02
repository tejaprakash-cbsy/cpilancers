import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForumService } from '@/services/forum.service';
import { ForbiddenError } from '@/lib/errors';
import * as supabaseServer from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

describe('ForumService', () => {
  let mockSupabase: unknown;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    };

    (supabaseServer.createClient as unknown as import("vitest").Mock).mockResolvedValue(mockSupabase);
  });

  describe('createPost', () => {
    it('creates a post successfully', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { status: 'open' }, error: null }); // get discussion status
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'post1' }, error: null }); // insert post

      const post = await ForumService.createPost({
        discussionId: 'disc1',
        authorId: 'auth1',
        body: 'hello world'
      });

      expect(post.id).toBe('post1');
      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_forum_reply_count', { discussion_id: 'disc1' });
    });

    it('fails if discussion is locked', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { status: 'locked' }, error: null });

      await expect(ForumService.createPost({
        discussionId: 'disc1',
        authorId: 'auth1',
        body: 'hello world'
      })).rejects.toThrow(ForbiddenError);
    });
  });

  describe('createDiscussion', () => {
    it('creates a discussion', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: { id: 'disc1' }, error: null });

      const disc = await ForumService.createDiscussion({
        categoryId: 'cat1',
        authorId: 'auth1',
        title: 'Title',
        body: 'Body'
      });

      expect(disc.id).toBe('disc1');
    });
  });
});
