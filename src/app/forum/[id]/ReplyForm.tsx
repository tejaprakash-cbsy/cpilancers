'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function ReplyForm({ discussionId }: { discussionId: string }) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/forum/discussions/${discussionId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to post reply');
      }

      setBody('');
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error posting reply');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="mb-3 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs">
          {error}
        </div>
      )}
      <textarea
        className="w-full bg-[#f5f6f8] border border-[#dde1e7] rounded-[10px] p-3 text-sm outline-none focus:border-[#365cf5] min-h-[120px] resize-y mb-3 text-[#172033]"
        placeholder="Write a clear, constructive reply..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={loading || !body.trim()}>
          {loading ? 'Posting...' : 'Post Reply'}
        </Button>
      </div>
    </form>
  );
}
