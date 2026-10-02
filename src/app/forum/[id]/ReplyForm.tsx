'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function ReplyForm({ discussionId }: { discussionId: string }) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/forum/discussions/${discussionId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body })
      });

      if (!res.ok) {
        throw new Error('Failed to post reply');
      }

      setBody('');
      router.refresh();
    } catch {
      alert('Error posting reply');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        className="w-full bg-[#f5f6f8] border border-[#dde1e7] rounded-[10px] p-3 text-sm outline-none focus:border-[#365cf5] min-h-[120px] resize-y mb-4"
        placeholder="Write a reply..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={loading || !body.trim()}>{loading ? 'Posting...' : 'Post Reply'}</Button>
      </div>
    </form>
  );
}
