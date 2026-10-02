import { ForumService } from '@/services/forum.service';
import { formatRelativeTime } from '@/lib/utils';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ReplyForm } from './ReplyForm';
import { AuthService } from '@/services/auth.service';

export default async function DiscussionPage({ params }: { params: { id: string } }) {
  const { id } = params;
  let discussion;
  let posts = [];
  let user = null;

  try {
    user = await AuthService.getCurrentUser().catch(() => null);
    discussion = await ForumService.getDiscussionById(id);
    posts = await ForumService.getPostsForDiscussion(id);
  } catch {
    return notFound();
  }

  return (
    <div className="bg-[#f5f6f8] min-h-screen text-[#172033] py-12">
      <div className="max-w-[800px] mx-auto px-6">
        <Link href="/forum" className="text-xs text-[#365cf5] hover:underline mb-6 inline-block">&larr; Back to Forum</Link>

        {/* OP */}
        <div className="bg-white p-6 rounded-[16px] border border-[#dde1e7] shadow-sm mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#365cf5] bg-[#eef1ff] px-2 py-1 rounded-md">{discussion.category?.name}</span>
          </div>
          <h1 className="text-2xl font-semibold mb-4">{discussion.title}</h1>
          <p className="text-sm whitespace-pre-wrap leading-relaxed text-[#172033]">{discussion.body}</p>
          <div className="mt-6 flex items-center justify-between text-xs text-[#667085] border-t border-[#dde1e7] pt-4">
            <span>Posted by {discussion.author?.display_name || 'Anonymous'} • {formatRelativeTime(discussion.created_at)}</span>
            <div className="flex gap-2">
              <span>{discussion.upvote_count} upvotes</span>
            </div>
          </div>
        </div>

        {/* Replies */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium">{posts.length} Replies</h2>
          {posts.map(post => (
            <div key={post.id} className="bg-white p-5 rounded-[12px] border border-[#dde1e7]">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{post.body}</p>
              <div className="mt-4 flex items-center justify-between text-xs text-[#667085]">
                <span>{post.author?.display_name || 'Anonymous'} • {formatRelativeTime(post.created_at)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Reply Form */}
        <div className="mt-8">
          {discussion.status === 'locked' ? (
            <div className="bg-yellow-50 text-yellow-800 p-4 rounded-[12px] border border-yellow-200 text-sm">
              This discussion has been locked and no longer accepts replies.
            </div>
          ) : user ? (
            <div className="bg-white p-6 rounded-[16px] border border-[#dde1e7]">
              <h3 className="font-semibold mb-4">Add a Reply</h3>
              <ReplyForm discussionId={discussion.id} />
            </div>
          ) : (
            <div className="bg-white p-6 rounded-[16px] border border-[#dde1e7] text-center">
              <p className="text-[#667085] text-sm mb-4">You must be logged in to reply.</p>
              <Link href={`/login?next=/forum/${discussion.id}`}><Button>Log in to reply</Button></Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
