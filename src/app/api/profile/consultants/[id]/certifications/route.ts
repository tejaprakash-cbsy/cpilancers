import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ProfileService } from '@/services/profile.service';
import { createAdminClient } from '@/lib/supabase/admin';
import { certificationFormSchema } from '@/lib/validations/profile.schemas';

async function ownsConsultant(id: string, userId: string) {
  const { data } = await createAdminClient().from('consultant_profiles').select('user_id').eq('id', id).single();
  return data?.user_id === userId;
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json({ success: true, data: await ProfileService.getConsultantCertifications(id) });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await AuthService.getCurrentUser();
  const { id } = await context.params;
  if (!user || !(await ownsConsultant(id, user.id))) return NextResponse.json({ success: false, error: { message: 'Forbidden.', code: 'FORBIDDEN' } }, { status: 403 });
  const value = certificationFormSchema.parse(await request.json());
  const data = await ProfileService.addConsultantCertification(id, { certification_id: value.certificationId || null, custom_name: value.customName || null, credential_id: value.credentialId || null, issue_date: value.issueDate, expiry_date: value.expiryDate || null, verification_document_url: value.verificationDocumentUrl, verification_status: 'pending', verified_by_admin_id: null, verified_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  return NextResponse.json({ success: true, data }, { status: 201 });
}
