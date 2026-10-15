import { ForumService } from '@/services/forum.service';
import { formatRelativeTime } from '@/lib/utils';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ReplyForm } from './ReplyForm';
import { AuthService } from '@/services/auth.service';
import { ArrowLeft, MessageSquare, Lock } from 'lucide-react';
import type { ForumPost } from '@/types/database';

export default async function DiscussionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let discussion;
  let posts: ForumPost[] = [];
  let user = null;

  try {
    user = await AuthService.getCurrentUser().catch(() => null);
    discussion = await ForumService.getDiscussionById(id);
    posts = await ForumService.getPostsForDiscussion(id);
  } catch (error) {
    console.error('[DiscussionPage - Fetch error]:', error);
    return notFound();
  }

  const categoryName = (discussion as unknown as { category?: { name: string } })?.category?.name;

  return (
    <div className="bg-[#f5f6f8] min-h-screen text-[#172033] py-10">
      <div className="max-w-[850px] mx-auto px-6">
        <Link
          href="/forum"
          className="text-xs text-[#365cf5] hover:underline mb-6 inline-flex items-center gap-1.5 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Discussions
        </Link>

        {/* OP Card */}
        <div className="bg-white p-7 rounded-[16px] border border-[#dde1e7] shadow-sm mb-8">
          <div className="flex items-center gap-2 mb-3">
            {categoryName && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#365cf5] bg-[#eef1ff] px-2.5 py-1 rounded-md">
                {categoryName}
              </span>
            )}
            {discussion.status === 'locked' && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md flex items-center gap-1">
                <Lock className="w-3 h-3" /> Locked
              </span>
            )}
          </div>
          <h1 className="text-2xl font-semibold mb-4 text-[#172033] leading-snug">
            {discussion.title}
          </h1>
          <div className="text-sm whitespace-pre-wrap leading-relaxed text-[#2c384e] bg-[#fafbfc] p-4 rounded-xl border border-[#f0f2f5]">
            {discussion.body}
          </div>
          <div className="mt-5 flex items-center justify-between text-xs text-[#667085] border-t border-[#f0f2f5] pt-4">
            <span>
              Posted by{' '}
              <strong className="text-[#172033] font-medium">
                {discussion.author?.display_name || 'Anonymous Community Member'}
              </strong>{' '}
              • {formatRelativeTime(discussion.created_at)}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" /> {discussion.reply_count} {discussion.reply_count === 1 ? 'reply' : 'replies'}
              </span>
            </div>
          </div>
        </div>

        {/* Replies Section */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#172033] flex items-center gap-2">
              Replies ({posts.length})
            </h2>
          </div>

          {posts.length > 0 ? (
            posts.map((post) => (
              <div
                key={post.id}
                className="bg-white p-5 rounded-[14px] border border-[#dde1e7] shadow-xs"
              >
                <div className="text-sm whitespace-pre-wrap leading-relaxed text-[#2c384e]">
                  {post.body}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-[#667085] border-t border-[#f5f6f8] pt-2.5">
                  <span>
                    By{' '}
                    <strong className="text-[#172033] font-medium">
                      {(post as unknown as { author?: { display_name?: string } })?.author?.display_name || 'Community Member'}
                    </strong>{' '}
                    • {formatRelativeTime(post.created_at)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-8 rounded-[14px] border border-[#dde1e7] text-center text-[#667085] text-xs">
              No replies yet. Be the first to share an answer or insight!
            </div>
          )}
        </div>

        {/* Reply Submission Form */}
        <div>
          {discussion.status === 'locked' ? (
            <div className="bg-amber-50 text-amber-900 p-4 rounded-[12px] border border-amber-200 text-sm flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0 text-amber-700" />
              <span>This discussion has been locked by a moderator and is not accepting further replies.</span>
            </div>
          ) : user ? (
            <div className="bg-white p-6 rounded-[16px] border border-[#dde1e7] shadow-sm">
              <h3 className="font-semibold text-sm mb-3 text-[#172033]">Add Your Reply</h3>
              <ReplyForm discussionId={discussion.id} />
            </div>
          ) : (
            <div className="bg-white p-8 rounded-[16px] border border-[#dde1e7] text-center">
              <h3 className="font-medium text-sm text-[#172033] mb-1">Join the conversation</h3>
              <p className="text-[#667085] text-xs mb-4">You must be logged in to post a reply.</p>
              <div className="flex justify-center gap-3">
                <Link href={`/login?next=/forum/${discussion.id}`}>
                  <Button size="sm">Log In to Reply</Button>
                </Link>
                <Link href={`/register?next=/forum/${discussion.id}`}>
                  <Button size="sm" variant="outline">Sign Up Free</Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
