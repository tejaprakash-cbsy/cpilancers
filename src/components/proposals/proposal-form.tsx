'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClientProposalService as ProposalService } from '@/services/client-api.service';
import { proposalCreateSchema } from '@/lib/validations/proposal.schemas';
import { formatErrorResponse } from '@/lib/errors';
import type { ProposalCreateFormData } from '@/lib/validations/proposal.schemas';

interface ProposalFormProps {
  jobId: string;
  onSubmitted?: () => void;
}

export default function ProposalForm({ jobId, onSubmitted }: ProposalFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ProposalCreateFormData>({
    job_id: jobId,
    cover_letter_markdown: '',
    technical_solution_markdown: '',
    proposed_duration_weeks: 4,
    proposed_price_cents: 50000,
    proposed_milestones: [{ title: 'Milestone 1', due_weeks: 2, amount_cents: 0 }],
    save_as_draft: false,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    if (type === 'checkbox') {
      setForm((prev) => ({ ...prev, [name]: checked }));
    } else if (['proposed_duration_weeks', 'proposed_price_cents'].includes(name)) {
      setForm((prev) => ({ ...prev, [name]: parseInt(value) || 0 }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleMilestoneChange = (index: number, field: string, value: string | number) => {
    setForm((prev) => {
      const milestones = [...prev.proposed_milestones];
      milestones[index] = { ...milestones[index], [field]: value };
      return { ...prev, proposed_milestones: milestones };
    });
  };

  const addMilestone = () => {
    setForm((prev) => ({
      ...prev,
      proposed_milestones: [
        ...prev.proposed_milestones,
        { title: '', description: '', due_weeks: 1, amount_cents: 0 },
      ],
    }));
  };

  const removeMilestone = (index: number) => {
    setForm((prev) => ({
      ...prev,
      proposed_milestones: prev.proposed_milestones.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate
      const validated = proposalCreateSchema.parse(form);

      // Submit proposal
      await ProposalService.createProposal({
        ...validated,
        status: validated.save_as_draft ? 'draft' : 'submitted',
      });

      if (onSubmitted) {
        onSubmitted();
      } else {
        router.push(`/consultant/proposals`);
        router.refresh();
      }
    } catch (err: unknown) {
      const formatted = formatErrorResponse(err);
      setError(formatted.error?.message || 'Failed to submit proposal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900">Submit a Proposal</h2>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 text-sm">
          {error}
        </div>
      )}

      {/* Cover Letter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Cover Letter
        </label>
        <textarea
          name="cover_letter_markdown"
          value={form.cover_letter_markdown}
          onChange={handleChange}
          rows={6}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Introduce yourself, explain your approach..."
          required
        />
        <p className="mt-1 text-xs text-gray-500">Minimum 100 characters.</p>
      </div>

      {/* Technical Solution */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Technical Solution
        </label>
        <textarea
          name="technical_solution_markdown"
          value={form.technical_solution_markdown}
          onChange={handleChange}
          rows={6}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Describe your technical approach to this integration..."
          required
        />
        <p className="mt-1 text-xs text-gray-500">Minimum 50 characters.</p>
      </div>

      {/* Duration + Price */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Proposed Duration (weeks)
          </label>
          <input
            type="number"
            name="proposed_duration_weeks"
            min={1}
            max={52}
            value={form.proposed_duration_weeks}
            onChange={handleChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Proposed Price (cents)
          </label>
          <input
            type="number"
            name="proposed_price_cents"
            min={100}
            value={form.proposed_price_cents}
            onChange={handleChange}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(form.proposed_price_cents / 100)}{' '}
            (in cents)
          </p>
        </div>
      </div>

      {/* Milestones */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Milestones
        </label>
        <div className="space-y-3">
          {form.proposed_milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Title"
                value={m.title}
                onChange={(e) => handleMilestoneChange(i, 'title', e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="number"
                placeholder="Weeks"
                value={m.due_weeks}
                onChange={(e) =>
                  handleMilestoneChange(i, 'due_weeks', parseInt(e.target.value))
                }
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="number"
                placeholder="Amount (cents)"
                value={m.amount_cents}
                onChange={(e) =>
                  handleMilestoneChange(i, 'amount_cents', parseInt(e.target.value))
                }
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={() => removeMilestone(i)}
                className="px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addMilestone}
          className="mt-2 text-sm text-blue-600 hover:text-blue-800"
        >
          + Add Milestone
        </button>
      </div>

      {/* Save as Draft */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="save_as_draft"
          checked={form.save_as_draft}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, save_as_draft: e.target.checked }))
          }
        />
        Save as draft (don&apos;t submit yet)
      </label>

      {/* Submit */}
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50"
        >
          {loading ? 'Submitting...' : form.save_as_draft ? 'Save Draft' : 'Submit Proposal'}
        </button>
      </div>
    </form>
  );
}
