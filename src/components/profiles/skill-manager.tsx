'use client';

import { useEffect, useState } from 'react';
import { ClientProfileService as ProfileService } from '@/services/client-api.service';
import { SkillBadge } from '@/components/profiles/skill-badge';
import { skillFormSchema } from '@/lib/validations/profile.schemas';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import type { ConsultantSkill, Skill } from '@/types/database';

/**
 * A consultant_skill row as rendered by this component. The component reads
 * `skill.skills || skill`, so the joined `skill` row is optional at this level.
 */
type ManagedSkill = ConsultantSkill & {
  id: string;
  skills?: Skill;
};

interface SkillManagerProps {
  consultantId: string;
  onUpdate?: () => void;
}

export default function SkillManager({ consultantId, onUpdate }: SkillManagerProps) {
  const [skills, setSkills] = useState<ManagedSkill[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state for adding new skill
  const [formData, setFormData] = useState({
    skill_id: '',
    is_primary: false,
    years_experience: 1,
    proficiency_level: 'advanced' as const,
  });

  // Fetch data
  useEffect(() => {
    loadData();
  }, [consultantId]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      
      // Get consultant's current skills
      const consultantSkills = await ProfileService.getConsultantSkills(consultantId);
      setSkills(consultantSkills as unknown as ManagedSkill[]);
      
      // Get all available skills
      const availableSkills = await ProfileService.getSkills();
      setAllSkills(availableSkills);
      
    } catch (err: unknown) {
      console.error('Error loading skills data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load skills data');
    } finally {
      setLoading(false);
    }
  }

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    let formattedValue: string | number = value;
    if (name === 'years_experience' && type === 'number') {
      formattedValue = value === '' ? 0 : parseInt(value);
    }
    
    setFormData(prev => ({ ...prev, [name]: formattedValue }) as typeof prev);
  };

  // Handle form submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);
    setError(null);
    
    try {
      // Validate form data
      const validatedData = skillFormSchema.parse(formData);
      
      // Add skill to consultant
      await ProfileService.addConsultantSkill(consultantId, {
        skill_id: validatedData.skillId,
        is_primary: validatedData.isPrimary,
        years_experience: validatedData.yearsExperience,
        proficiency_level: validatedData.proficiencyLevel,
      });
      
      // Reset form
      setFormData({
        skill_id: '',
        is_primary: false,
        years_experience: 1,
        proficiency_level: 'advanced',
      });
      
      // Reload data
      await loadData();
      
      // Notify parent to update
      if (onUpdate) onUpdate();
      
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        setError('Please fix the errors in the form');
      } else {
        console.error('Error adding skill:', err);
        setError(err instanceof Error ? err.message : 'Failed to add skill');
      }
    } finally {
      setIsAdding(false);
    }
  }

  // Handle skill removal
  async function handleRemove(skillId: string) {
    if (!window.confirm('Are you sure you want to remove this skill?')) return;
    
    try {
      await ProfileService.removeConsultantSkill(consultantId, skillId);
      
      // Reload data
      await loadData();
      
      // Notify parent to update
      if (onUpdate) onUpdate();
      
    } catch (err: unknown) {
      console.error('Error removing skill:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove skill');
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p>Loading skills...</p>
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
        <h2 className="text-lg font-semibold text-gray-900">SAP Skills</h2>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className={cn(
            'px-3 py-1 bg-blue-50 hover:bg-blue-100 text-sm font-medium text-blue-600 rounded hover:text-blue-800',
            'isAdding:bg-blue-100 isAdding:text-blue-700'
          )}
        >
          {isAdding ? 'Cancel' : 'Add Skill'}
        </button>
      </div>
      
      {/* Skills List */}
      <div className="space-y-4">
        {skills.length > 0 ? (
          <div className="space-y-2">
            {skills.map((skill) => (
              <div key={skill.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <SkillBadge 
                    skill={(skill.skills || skill) as Skill} 
                    yearsExperience={skill.years_experience}
                    proficiencyLevel={skill.proficiency_level}
                    isPrimary={skill.is_primary}
                    size="md"
                  />
                </div>
                <button
                  onClick={() => handleRemove(skill.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 italic text-center py-6">
            No skills added yet. Add your SAP skills below.
          </p>
        )}
      </div>
      
      {/* Add Skill Form */}
      {isAdding && (
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-md font-medium text-gray-900 mb-4">Add New Skill</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Skill
              </label>
              <select
                name="skill_id"
                value={formData.skill_id}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select a skill</option>
                {allSkills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name} ({skill.category})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Select the SAP skill you want to add to your profile
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Years of Experience
                </label>
                <input
                  type="number"
                  name="years_experience"
                  value={formData.years_experience}
                  onChange={handleChange}
                  min="0"
                  max="50"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  How many years of experience you have with this skill
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Proficiency Level
                </label>
                <select
                  name="proficiency_level"
                  value={formData.proficiency_level}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Your proficiency level with this skill
                </p>
              </div>
            </div>
            
            <div className="flex items-center">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  name="is_primary"
                  checked={formData.is_primary}
                  onChange={handleChange}
                />
                Primary Skill (highlighted on profile)
              </label>
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
                {isAdding ? 'Adding...' : 'Add Skill'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
