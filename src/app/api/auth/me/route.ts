import { NextResponse } from 'next/server';
import { createVerifiedSupabaseContext } from '@/lib/supabase/context';
import { createAdminClient } from '@/lib/supabase/admin';
export async function GET() {
  const context = await createVerifiedSupabaseContext();
  if (context.error) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
  const userId = context.data.userClaims?.id;
  if (!userId) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
  const { data: user } = await createAdminClient()
    .from('users')
    .select('id, email, role, status, is_email_verified, phone_number, last_login_at, created_at, updated_at')
    .eq('id', userId)
    .single();
  if (!user) return NextResponse.json({ success: false, error: { message: 'User record not found.', code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ success: true, data: user });
}
