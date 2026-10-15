import Link from 'next/link';
import { ForumService } from '@/services/forum.service';
import { Button } from '@/components/ui/button';
import { Search, MessageSquare, Tag, X } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import type { ForumCategory, ForumDiscussion } from '@/types/database';

export default async function ForumPage({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string; search?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const currentCategory = resolvedParams.category;
  const currentSearch = resolvedParams.search;

  let categories: ForumCategory[] = [];
  let discussions: ForumDiscussion[] = [];
  try {
    categories = await ForumService.getCategories();
    const result = await ForumService.getDiscussions({
      page: 1,
      limit: 20,
      categorySlug: currentCategory,
      search: currentSearch,
    });
    discussions = result.discussions;
  } catch (err) {
    console.error('[ForumPage - Load Error]:', err);
  }

  const activeCategoryObj = categories.find((c) => c.slug === currentCategory);

  return (
    <div className="bg-[#f5f6f8] min-h-screen text-[#172033]">
      <section className="bg-white border-b border-[#dde1e7]">
        <div className="max-w-[1280px] mx-auto px-6 py-12 sm:px-10 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#eef1ff] text-[#365cf5] mb-4">
            <MessageSquare className="w-3.5 h-3.5" /> Free Community Platform
          </span>
          <h1 className="text-4xl font-normal tracking-tight">CPI Lancers Community Forum</h1>
          <p className="mt-4 text-[#667085] max-w-xl mx-auto">
            The open technical hub for SAP Cloud Integration, PI/PO, Integration Suite, and enterprise automation professionals.
          </p>
          <form method="GET" action="/forum" className="mt-8 max-w-lg mx-auto flex items-center bg-white border border-[#dde1e7] rounded-[10px] p-1 shadow-sm">
            <Search className="w-5 h-5 ml-2 text-[#667085]" />
            <input
              type="text"
              name="search"
              defaultValue={currentSearch || ''}
              placeholder="Search discussions by topic..."
              className="flex-1 bg-transparent border-none outline-none px-3 py-2 text-sm text-[#172033]"
            />
            {currentCategory && <input type="hidden" name="category" value={currentCategory} />}
            <Button size="sm" type="submit">Search</Button>
          </form>
        </div>
      </section>

      <section className="max-w-[1280px] mx-auto px-6 py-12 sm:px-10 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-medium">
                {activeCategoryObj ? activeCategoryObj.name : 'Recent Discussions'}
              </h2>
              {(currentCategory || currentSearch) && (
                <Link
                  href="/forum"
                  className="inline-flex items-center gap-1 text-xs text-[#667085] hover:text-[#365cf5] bg-white border border-[#dde1e7] px-2 py-1 rounded-md"
                >
                  <X className="w-3 h-3" /> Clear filters
                </Link>
              )}
            </div>
            <Link href="/forum/new">
              <Button size="sm">Start Discussion</Button>
            </Link>
          </div>

          {currentSearch && (
            <div className="mb-4 text-xs text-[#667085]">
              Showing results for &ldquo;{currentSearch}&rdquo;
            </div>
          )}

          <div className="space-y-4">
            {discussions.length > 0 ? (
              discussions.map((d) => (
                <div
                  key={d.id}
                  className="bg-white p-5 rounded-[16px] border border-[#dde1e7] hover:border-[#365cf5]/50 hover:shadow-sm transition"
                >
                  <Link href={`/forum/${d.id}`} className="block">
                    <div className="flex items-center gap-2 mb-1.5">
                      {d.is_pinned && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                          Pinned
                        </span>
                      )}
                      {(d as unknown as { category?: { name: string } })?.category?.name && (
                        <span className="text-[10px] font-semibold text-[#365cf5] bg-[#eef1ff] px-2 py-0.5 rounded">
                          {(d as unknown as { category?: { name: string } }).category?.name}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-base text-[#172033] hover:text-[#365cf5] transition-colors">
                      {d.title}
                    </h3>
                    <p className="mt-1 text-xs text-[#667085] line-clamp-2 leading-relaxed">
                      {d.body}
                    </p>
                    <div className="mt-3 text-xs text-[#667085] flex items-center gap-3 pt-2 border-t border-[#f0f2f5]">
                      <span>By {d.author?.display_name || 'Anonymous Community Member'}</span>
                      <span>•</span>
                      <span>{formatRelativeTime(d.created_at)}</span>
                      <span>•</span>
                      <span>{d.reply_count} {d.reply_count === 1 ? 'reply' : 'replies'}</span>
                    </div>
                  </Link>
                </div>
              ))
            ) : (
              <div className="bg-white p-12 rounded-[16px] border border-[#dde1e7] text-center">
                <MessageSquare className="w-10 h-10 text-[#667085]/40 mx-auto mb-3" />
                <h3 className="text-base font-medium text-[#172033]">No discussions found</h3>
                <p className="mt-1 text-[#667085] text-sm">
                  {currentCategory || currentSearch
                    ? 'No discussions match your filter. Try clearing filters or exploring other categories.'
                    : 'Be the first to start a conversation with the community!'}
                </p>
                <div className="mt-5">
                  <Link href="/forum/new">
                    <Button size="sm">Start First Discussion</Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#365cf5] flex items-center gap-1.5">
              <Tag className="w-4 h-4" /> Categories
            </h2>
            {currentCategory && (
              <Link href="/forum" className="text-xs text-[#667085] hover:text-[#172033]">
                View All
              </Link>
            )}
          </div>
          <div className="bg-white rounded-[16px] border border-[#dde1e7] p-3 flex flex-col gap-1">
            <Link
              href="/forum"
              className={`text-xs px-3 py-2 rounded-lg transition-colors ${
                !currentCategory
                  ? 'bg-[#eef1ff] font-semibold text-[#365cf5]'
                  : 'text-[#667085] hover:bg-[#f5f6f8] hover:text-[#172033]'
              }`}
            >
              All Categories
            </Link>
            {categories.length > 0 ? (
              categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/forum?category=${c.slug}${currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ''}`}
                  className={`text-xs px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                    currentCategory === c.slug
                      ? 'bg-[#eef1ff] font-semibold text-[#365cf5]'
                      : 'text-[#667085] hover:bg-[#f5f6f8] hover:text-[#172033]'
                  }`}
                >
                  <span>{c.name}</span>
                </Link>
              ))
            ) : (
              <p className="text-xs text-[#667085] p-2">Loading categories...</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
