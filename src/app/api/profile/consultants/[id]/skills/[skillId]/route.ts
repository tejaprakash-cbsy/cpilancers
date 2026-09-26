import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ProfileService } from '@/services/profile.service';
import { createAdminClient } from '@/lib/supabase/admin';
export async function DELETE(_request: Request, context: { params: Promise<{ id: string; skillId: string }> }) {
  const user = await AuthService.getCurrentUser();
  const { id, skillId } = await context.params;
  const { data } = user ? await createAdminClient().from('consultant_profiles').select('user_id').eq('id', id).single() : { data: null };
  if (!user || data?.user_id !== user.id) return NextResponse.json({ success: false, error: { message: 'Forbidden.', code: 'FORBIDDEN' } }, { status: 403 });
  await ProfileService.removeConsultantSkill(id, skillId);
  return NextResponse.json({ success: true });
}
