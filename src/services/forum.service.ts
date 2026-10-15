import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError, ForbiddenError, NotFoundError } from '@/lib/errors';
import type { ForumCategory, ForumDiscussion, ForumPost } from '@/types/database';

export interface DiscussionWithAuthor extends ForumDiscussion {
  category?: { name: string; slug: string } | null;
}

export class ForumService {
  /** Categories */
  static async getCategories(): Promise<ForumCategory[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('forum_categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw new AppError('Failed to fetch categories', 500);
    return (data || []) as ForumCategory[];
  }

  /** Discussions */
  static async getDiscussions(params: {
    page?: number;
    limit?: number;
    categorySlug?: string;
    search?: string;
  } = {}): Promise<{ discussions: DiscussionWithAuthor[]; total: number }> {
    const supabase = await createClient();
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 20));

    let query = supabase
      .from('forum_discussions')
      .select('*, category:forum_categories(name, slug)', { count: 'exact' })
      .eq('status', 'open');

    if (params.categorySlug) {
      const { data: cat } = await supabase
        .from('forum_categories')
        .select('id')
        .eq('slug', params.categorySlug)
        .maybeSingle();

      if (cat?.id) {
        query = query.eq('category_id', cat.id);
      }
    }

    if (params.search?.trim()) {
      const cleanSearch = params.search.trim().replace(/[%_]/g, '');
      if (cleanSearch) {
        query = query.ilike('title', `%${cleanSearch}%`);
      }
    }

    query = query
      .order('is_pinned', { ascending: false })
      .order('last_activity_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) {
      console.error('[ForumService.getDiscussions]:', error);
      throw new AppError('Failed to fetch discussions', 500);
    }

    const discussions = (data || []) as unknown as DiscussionWithAuthor[];

    // Batch resolve author profiles to avoid broken foreign-key embed in PostgREST
    const authorIds = [...new Set(discussions.map((d) => d.author_id).filter(Boolean))];
    if (authorIds.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, display_name')
          .in('user_id', authorIds);

        const profileMap = new Map(
          (profiles || []).map((p) => [
            p.user_id,
            {
              id: p.user_id,
              display_name: p.display_name,
              first_name: p.first_name,
              last_name: p.last_name,
            },
          ])
        );

        for (const disc of discussions) {
          disc.author = profileMap.get(disc.author_id) ?? null;
        }
      } catch (err) {
        console.error('[ForumService.getDiscussions] Failed to resolve profiles:', err);
      }
    }

    return { discussions, total: count || 0 };
  }

  static async getDiscussionById(id: string): Promise<ForumDiscussion> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('forum_discussions')
      .select('*, category:forum_categories(name, slug)')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundError('Discussion not found');

    const discussion = data as unknown as ForumDiscussion;

    if (discussion.author_id) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, display_name')
          .eq('user_id', discussion.author_id)
          .maybeSingle();

        if (profile) {
          discussion.author = {
            id: profile.user_id,
            display_name: profile.display_name,
            first_name: profile.first_name,
            last_name: profile.last_name,
          };
        }
      } catch (err) {
        console.error('[ForumService.getDiscussionById] Failed to resolve profile:', err);
      }
    }

    return discussion;
  }

  static async createDiscussion(params: {
    categoryId: string;
    title: string;
    body: string;
    authorId: string;
  }): Promise<ForumDiscussion> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('forum_discussions')
      .insert({
        category_id: params.categoryId,
        author_id: params.authorId,
        title: params.title,
        body: params.body,
      })
      .select()
      .single();

    if (error) {
      console.error('[ForumService.createDiscussion]:', error);
      throw new AppError('Failed to create discussion', 500);
    }

    return data as ForumDiscussion;
  }

  static async updateDiscussion(
    id: string,
    params: { title?: string; body?: string; status?: 'open' | 'locked' | 'deleted' },
    userId: string
  ): Promise<ForumDiscussion> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('forum_discussions')
      .update(params)
      .eq('id', id)
      .eq('author_id', userId)
      .select()
      .single();

    if (error) throw new AppError('Failed to update discussion', 500);
    return data as ForumDiscussion;
  }

  /** Posts (Replies) */
  static async getPostsForDiscussion(discussionId: string): Promise<ForumPost[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('forum_posts')
      .select('*')
      .eq('discussion_id', discussionId)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (error) throw new AppError('Failed to fetch replies', 500);

    const posts = (data || []) as unknown as (ForumPost & {
      author?: { id: string; display_name: string | null; first_name?: string | null; last_name?: string | null } | null;
    })[];

    const authorIds = [...new Set(posts.map((p) => p.author_id).filter(Boolean))];
    if (authorIds.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, display_name')
          .in('user_id', authorIds);

        const profileMap = new Map(
          (profiles || []).map((p) => [
            p.user_id,
            {
              id: p.user_id,
              display_name: p.display_name,
              first_name: p.first_name,
              last_name: p.last_name,
            },
          ])
        );

        for (const post of posts) {
          post.author = profileMap.get(post.author_id) ?? null;
        }
      } catch (err) {
        console.error('[ForumService.getPostsForDiscussion] Failed to resolve profiles:', err);
      }
    }

    return posts as ForumPost[];
  }

  static async createPost(params: {
    discussionId: string;
    body: string;
    authorId: string;
  }): Promise<ForumPost> {
    const supabase = await createClient();

    // Check if discussion is open
    const { data: discussion, error: discErr } = await supabase
      .from('forum_discussions')
      .select('status')
      .eq('id', params.discussionId)
      .single();

    if (discErr || !discussion || discussion.status !== 'open') {
      throw new ForbiddenError('Discussion is locked or deleted.');
    }

    const { data, error } = await supabase
      .from('forum_posts')
      .insert({
        discussion_id: params.discussionId,
        author_id: params.authorId,
        body: params.body,
      })
      .select()
      .single();

    if (error) {
      console.error('[ForumService.createPost]:', error);
      throw new AppError('Failed to create reply', 500);
    }

    // Attempt RPC increment (for compatibility with mock tests and remote if available)
    try {
      await supabase.rpc('increment_forum_reply_count', { discussion_id: params.discussionId });
    } catch {
      // Fallback if RPC function is missing
    }

    // Safely update reply_count and last_activity_at using admin client
    try {
      const adminClient = createAdminClient();
      const { count: postCount } = await adminClient
        .from('forum_posts')
        .select('id', { count: 'exact', head: true })
        .eq('discussion_id', params.discussionId)
        .eq('status', 'active');

      await adminClient
        .from('forum_discussions')
        .update({
          reply_count: postCount ?? 1,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', params.discussionId);
    } catch (metaErr) {
      console.error('[ForumService.createPost] Metadata update error:', metaErr);
    }

    return data as ForumPost;
  }
}
