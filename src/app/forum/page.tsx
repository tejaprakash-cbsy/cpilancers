import Link from 'next/link';
import { ForumService } from '@/services/forum.service';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import type { ForumCategory } from '@/types/database';

export default async function ForumPage() {
  let categories: ForumCategory[] = [];
  let discussions: import("@/types/database").ForumDiscussion[] = [];
  try {
    categories = await ForumService.getCategories();
    const result = await ForumService.getDiscussions({ page: 1, limit: 20 });
    discussions = result.discussions;
  } catch {
    // Handling empty state or missing DB tables
  }

  return (
    <div className="bg-[#f5f6f8] min-h-screen text-[#172033]">
      <section className="bg-white border-b border-[#dde1e7]">
        <div className="max-w-[1280px] mx-auto px-6 py-12 sm:px-10 text-center">
          <h1 className="text-4xl font-normal tracking-tight">Community Forum</h1>
          <p className="mt-4 text-[#667085]">Ask questions. Share solutions. Learn from other professionals.</p>
          <div className="mt-8 max-w-lg mx-auto flex items-center bg-white border border-[#dde1e7] rounded-[10px] p-1 shadow-sm">
            <Search className="w-5 h-5 ml-2 text-[#667085]" />
            <input type="text" placeholder="Search discussions..." className="flex-1 bg-transparent border-none outline-none px-3 py-2 text-sm" />
            <Button size="sm">Search</Button>
          </div>
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-6 py-12 sm:px-10 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-medium">Recent Discussions</h2>
            <Link href="/forum/new"><Button size="sm">Start Discussion</Button></Link>
          </div>

          <div className="space-y-4">
            {discussions.length > 0 ? discussions.map(d => (
              <div key={d.id} className="bg-white p-5 rounded-[16px] border border-[#dde1e7] hover:border-[#365cf5]/50 hover:shadow-sm transition">
                <Link href={`/forum/${d.id}`} className="block">
                  <h3 className="font-semibold text-base">{d.title}</h3>
                  <div className="mt-2 text-xs text-[#667085] flex items-center gap-3">
                    <span>{d.author?.display_name || 'Anonymous'}</span>
                    <span>•</span>
                    <span>{formatRelativeTime(d.created_at)}</span>
                    <span>•</span>
                    <span>{d.reply_count} replies</span>
                  </div>
                </Link>
              </div>
            )) : (
              <div className="bg-white p-8 rounded-[16px] border border-[#dde1e7] text-center">
                <p className="text-[#667085] text-sm">No discussions yet. Be the first to start one!</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#365cf5] mb-4">Categories</h2>
          <div className="bg-white rounded-[16px] border border-[#dde1e7] p-4 flex flex-col gap-2">
            {categories.length > 0 ? categories.map(c => (
              <Link key={c.id} href={`/forum?category=${c.slug}`} className="text-sm text-[#667085] hover:text-[#172033] py-1">
                {c.name}
              </Link>
            )) : (
              <p className="text-xs text-[#667085]">No categories found.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
