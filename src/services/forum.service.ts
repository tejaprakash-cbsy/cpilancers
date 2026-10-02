import { createClient } from '@/lib/supabase/server';
import { AppError, ForbiddenError, NotFoundError } from '@/lib/errors';
import type { ForumCategory } from '@/types/database';

export class ForumService {
  /** Categories */
  static async getCategories() {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('forum_categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw new AppError('Failed to fetch categories', 500);
    return data as ForumCategory[];
  }

  /** Discussions */
  static async getDiscussions(params: {
    page: number;
    limit: number;
    categorySlug?: string;
    search?: string;
  }) {
    const supabase = await createClient();

    let query = supabase
      .from('forum_discussions')
      .select('*, author:profiles!forum_discussions_author_id_fkey(first_name, last_name, display_name)', { count: 'exact' })
      .eq('status', 'open');

    if (params.categorySlug) {
      // Need to resolve category_id from slug first, or join.
      // Simplified: Assume we have category_id or we filter by category_id directly.
      // For a real join, PostgREST can do it, but let's look up the category first.
      const { data: cat } = await supabase.from('forum_categories').select('id').eq('slug', params.categorySlug).single();
      if (cat) query = query.eq('category_id', cat.id);
    }

    if (params.search) {
      query = query.textSearch('title', params.search);
    }

    query = query.order('is_pinned', { ascending: false })
                 .order('last_activity_at', { ascending: false })
                 .range((params.page - 1) * params.limit, params.page * params.limit - 1);

    const { data, error, count } = await query;
    if (error) throw new AppError('Failed to fetch discussions', 500);
    return { discussions: data, total: count || 0 };
  }

  static async getDiscussionById(id: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('forum_discussions')
      .select('*, author:profiles!forum_discussions_author_id_fkey(first_name, last_name, display_name), category:forum_categories(name, slug)')
      .eq('id', id)
      .single();

    if (error) throw new NotFoundError('Discussion not found');
    return data;
  }

  static async createDiscussion(params: { categoryId: string, title: string, body: string, authorId: string }) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('forum_discussions')
      .insert({
        category_id: params.categoryId,
        author_id: params.authorId,
        title: params.title,
        body: params.body
      })
      .select()
      .single();
    if (error) throw new AppError('Failed to create discussion', 500);
    return data;
  }

  static async updateDiscussion(id: string, params: { title?: string, body?: string }, userId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('forum_discussions')
      .update(params)
      .eq('id', id)
      .eq('author_id', userId)
      .select()
      .single();
    if (error) throw new AppError('Failed to update discussion', 500);
    return data;
  }

  /** Posts (Replies) */
  static async getPostsForDiscussion(discussionId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('forum_posts')
      .select('*, author:profiles!forum_posts_author_id_fkey(first_name, last_name, display_name)')
      .eq('discussion_id', discussionId)
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (error) throw new AppError('Failed to fetch replies', 500);
    return data;
  }

  static async createPost(params: { discussionId: string, body: string, authorId: string }) {
    const supabase = await createClient();

    // Check if discussion is open
    const { data: discussion } = await supabase.from('forum_discussions').select('status').eq('id', params.discussionId).single();
    if (!discussion || discussion.status !== 'open') {
      throw new ForbiddenError('Discussion is locked or deleted.');
    }

    const { data, error } = await supabase
      .from('forum_posts')
      .insert({
        discussion_id: params.discussionId,
        author_id: params.authorId,
        body: params.body
      })
      .select()
      .single();

    if (error) throw new AppError('Failed to create reply', 500);

    // Update discussion reply count & last activity
    await supabase.rpc('increment_forum_reply_count', { discussion_id: params.discussionId });

    return data;
  }
}
