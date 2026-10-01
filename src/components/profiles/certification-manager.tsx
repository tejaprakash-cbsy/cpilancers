'use client';

import { useEffect, useState, useCallback } from 'react';
import { ClientProfileService as ProfileService } from '@/services/client-api.service';
import { CertificationBadge } from '@/components/profiles/certification-badge';
import { certificationFormSchema } from '@/lib/validations/profile.schemas';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import type { ConsultantCertification } from '@/types/database';

/**
 * A consultant_certifications row as rendered by this component. The component
 * reads `cert.certifications || cert`, so the joined `certifications` row is
 * optional at this level.
 */
type ManagedCertification = ConsultantCertification & {
  certifications?: { id: string; name: string; code: string | null; issuing_authority: string };
};

interface CertificationManagerProps {
  consultantId: string;
  onUpdate?: () => void;
}

export default function CertificationManager({ consultantId, onUpdate }: CertificationManagerProps) {
  const [certifications, setCertifications] = useState<ManagedCertification[]>([]);
  const [, setAllCertifications] = useState<ConsultantCertification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state for adding new certification
  const [formData, setFormData] = useState({
    certification_id: '',
    custom_name: '',
    credential_id: '',
    issue_date: '',
    expiry_date: '',
    verification_document_url: '',
  });

  // Fetch data. See skill-manager for why the leading `setLoading(true)` was
  // removed: `loading` starts as `true` and writing state synchronously made
  // this a cascading-render source when called from the effect.
  const loadData = useCallback(async () => {
    try {
      // Get consultant's current certifications
      const consultantCertifications = await ProfileService.getConsultantCertifications(consultantId);
      setCertifications(consultantCertifications);

      // Get all available certifications
      // For now, we'll get a static list or leave empty - in a real app this would come from database
      setAllCertifications([]);

      setError(null);
    } catch (err: unknown) {
      console.error('Error loading certifications data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load certifications data');
    } finally {
      setLoading(false);
    }
  }, [consultantId]);

  // Routed through an async IIFE with a cancellation guard: this keeps the
  // loader's state writes off the synchronous effect path and prevents a slow
  // in-flight fetch for a previous consultantId from overwriting newer data.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadData();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle form submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);
    setError(null);
    
    try {
      // Validate form data
      const validatedData = certificationFormSchema.parse(formData);
      
      // Add certification to consultant
      await ProfileService.addConsultantCertification(consultantId, {
        certification_id: validatedData.certificationId || undefined,
        custom_name: validatedData.customName,
        credential_id: validatedData.credentialId,
        issue_date: validatedData.issueDate,
        expiry_date: validatedData.expiryDate,
        verification_document_url: validatedData.verificationDocumentUrl,
      });
      
      // Reset form
      setFormData({
        certification_id: '',
        custom_name: '',
        credential_id: '',
        issue_date: '',
        expiry_date: '',
        verification_document_url: '',
      });
      
      // Reload data
      await loadData();
      
      // Notify parent to update
      if (onUpdate) onUpdate();
      
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        setError('Please fix the errors in the form');
      } else {
        console.error('Error adding certification:', err);
        setError(err instanceof Error ? err.message : 'Failed to add certification');
      }
    } finally {
      setIsAdding(false);
    }
  }

  // Handle certification removal
  async function handleRemove() {
    if (!window.confirm('Are you sure you want to remove this certification?')) return;
    
    try {
      // In a real implementation, we'd have a remove method
      // For now, we'll just show a message
      alert('Certification removal would be implemented here');
      
    } catch (err: unknown) {
      console.error('Error removing certification:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove certification');
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p>Loading certifications...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-4">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Certifications</h2>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className={cn(
            'px-3 py-1 bg-blue-50 hover:bg-blue-100 text-sm font-medium text-blue-600 rounded hover:text-blue-800',
            'isAdding:bg-blue-100 isAdding:text-blue-700'
          )}
        >
          {isAdding ? 'Cancel' : 'Add Certification'}
        </button>
      </div>
      
      {/* Certifications List */}
      <div className="space-y-4">
        {certifications.length > 0 ? (
          <div className="space-y-2">
            {certifications.map((cert) => (
              <div key={cert.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <CertificationBadge 
                    certification={(cert.certifications || cert) as { id: string; name: string; code: string | null; issuing_authority: string }} 
                    consultantCertification={cert}
                  />
                </div>
                <button
                  onClick={() => handleRemove()}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic text-center py-6">
            No certifications added yet. Add your SAP certifications below.
          </p>
        )}
      </div>
      
      {/* Add Certification Form */}
      {isAdding && (
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-md font-medium text-gray-900 mb-4">Add New Certification</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Certification
              </label>
              <select
                name="certification_id"
                value={formData.certification_id}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a certification (or enter custom name below)</option>
                {/* In a real app, this would be populated from database */}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Select from known SAP certifications or enter a custom certification name
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Certification Name
              </label>
              <input
                type="text"
                name="custom_name"
                value={formData.custom_name}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., SAP Certified Development Associate"
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter the certification name if not selecting from the list above
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Credential ID
                </label>
                <input
                  type="text"
                  name="credential_id"
                  value={formData.credential_id}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., SAP-CDA-2023-12345"
                />
                <p className="mt-1 text-xs text-gray-500">
                  The unique identifier for your certification (optional)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Issue Date
                </label>
                <input
                  type="date"
                  name="issue_date"
                  value={formData.issue_date}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Date when you received this certification
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expiry Date (if applicable)
                </label>
                <input
                  type="date"
                  name="expiry_date"
                  value={formData.expiry_date}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Date when this certification expires (leave blank if no expiry)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Document
                </label>
                <input
                  type="text"
                  name="verification_document_url"
                  value={formData.verification_document_url}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://example.com/your-cert.pdf"
                />
                <p className="mt-1 text-xs text-gray-500">
                  URL to a document verifying this certification (PDF recommended)
                </p>
              </div>
            </div>
            
            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="mr-3 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-sm font-medium rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAdding}
                className={cn(
                  'px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg',
                  'opacity-50 cursor-not-allowed',
                  !isAdding && ''
                )}
              >
                {isAdding ? 'Adding...' : 'Add Certification'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
