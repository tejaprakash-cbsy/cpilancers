'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { ForumCategory } from '@/types/database';

export function CreateDiscussionForm({ categories }: { categories: ForumCategory[] }) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !categoryId || !body.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/forum/discussions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          categoryId,
          body: body.trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error?.message || 'Failed to create discussion');
      }

      router.push(`/forum/${json.data.id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error creating discussion');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-[#172033] mb-2">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full bg-[#f5f6f8] border border-[#dde1e7] rounded-[10px] p-3 text-sm text-[#172033] outline-none focus:border-[#365cf5]"
          required
        >
          <option value="" disabled>
            Select a relevant category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-[#667085]">
          Choose the topic area that best matches your question or discussion.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#172033] mb-2">
          Discussion Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-[#f5f6f8] border border-[#dde1e7] rounded-[10px] p-3 text-sm text-[#172033] outline-none focus:border-[#365cf5]"
          placeholder="e.g. How to handle OAuth 2.0 token caching in SAP CPI?"
          maxLength={150}
          required
        />
        <div className="mt-1 flex justify-between text-[11px] text-[#667085]">
          <span>Be specific and imagine asking another engineer.</span>
          <span>{title.length}/150</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#172033] mb-2">
          Description / Details <span className="text-red-500">*</span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full bg-[#f5f6f8] border border-[#dde1e7] rounded-[10px] p-3 text-sm text-[#172033] outline-none focus:border-[#365cf5] min-h-[200px] resize-y"
          placeholder="Provide background, error logs, configuration details, or specific architectural context..."
          required
        />
      </div>

      <div className="flex justify-end gap-3 mt-2 border-t border-[#f0f2f5] pt-5">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading || !title.trim() || !body.trim() || !categoryId}
        >
          {loading ? 'Publishing...' : 'Publish Discussion'}
        </Button>
      </div>
    </form>
  );
}
