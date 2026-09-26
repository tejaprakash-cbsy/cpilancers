import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ProfileService } from '@/services/profile.service';
import { createAdminClient } from '@/lib/supabase/admin';
import { skillFormSchema } from '@/lib/validations/profile.schemas';

async function ownsConsultant(id: string, userId: string) {
  const { data } = await createAdminClient().from('consultant_profiles').select('user_id').eq('id', id).single();
  return data?.user_id === userId;
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json({ success: true, data: await ProfileService.getConsultantSkills(id) });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await AuthService.getCurrentUser();
  const { id } = await context.params;
  if (!user || !(await ownsConsultant(id, user.id))) return NextResponse.json({ success: false, error: { message: 'Forbidden.', code: 'FORBIDDEN' } }, { status: 403 });
  const value = skillFormSchema.parse(await request.json());
  const data = await ProfileService.addConsultantSkill(id, { skill_id: value.skillId, is_primary: value.isPrimary, years_experience: value.yearsExperience, proficiency_level: value.proficiencyLevel, created_at: new Date().toISOString() });
  return NextResponse.json({ success: true, data }, { status: 201 });
}
