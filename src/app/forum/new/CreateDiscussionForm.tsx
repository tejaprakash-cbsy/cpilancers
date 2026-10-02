'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function CreateDiscussionForm({ categories }: { categories: import("@/types/database").ForumCategory[] }) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !categoryId || !body.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/forum/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, categoryId, body })
      });

      if (!res.ok) {
        throw new Error('Failed to create discussion');
      }

      const { data } = await res.json();
      router.push(`/forum/${data.id}`);
      router.refresh();
    } catch {
      alert('Error creating discussion');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <label className="block text-sm font-medium mb-2">Category</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full bg-[#f5f6f8] border border-[#dde1e7] rounded-[10px] p-3 text-sm outline-none focus:border-[#365cf5]"
          required
        >
          <option value="" disabled>Select a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-[#f5f6f8] border border-[#dde1e7] rounded-[10px] p-3 text-sm outline-none focus:border-[#365cf5]"
          placeholder="What's your question or topic?"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full bg-[#f5f6f8] border border-[#dde1e7] rounded-[10px] p-3 text-sm outline-none focus:border-[#365cf5] min-h-[200px] resize-y"
          placeholder="Provide details..."
          required
        />
      </div>

      <div className="flex justify-end gap-3 mt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>Cancel</Button>
        <Button type="submit" disabled={loading || !title.trim() || !body.trim() || !categoryId}>
          {loading ? 'Posting...' : 'Post Discussion'}
        </Button>
      </div>
    </form>
  );
}
