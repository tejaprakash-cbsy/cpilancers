import { ForumService } from '@/services/forum.service';
import { CreateDiscussionForm } from './CreateDiscussionForm';
import { AuthService } from '@/services/auth.service';
import { redirect } from 'next/navigation';
import type { ForumCategory } from '@/types/database';

export const dynamic = 'force-dynamic';

export default async function NewDiscussionPage() {
  const user = await AuthService.getCurrentUser().catch(() => null);
  if (!user) {
    redirect('/login?next=/forum/new');
  }

  let categories: ForumCategory[] = [];
  try {
    categories = await ForumService.getCategories();
  } catch {
    // ignore
  }

  return (
    <div className="bg-[#f5f6f8] min-h-screen text-[#172033] py-12">
      <div className="max-w-[800px] mx-auto px-6">
        <h1 className="text-2xl font-semibold mb-6">Start a New Discussion</h1>
        <div className="bg-white p-8 rounded-[16px] border border-[#dde1e7] shadow-sm">
          <CreateDiscussionForm categories={categories} />
        </div>
      </div>
    </div>
  );
}
