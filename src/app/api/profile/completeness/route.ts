import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ProfileService } from '@/services/profile.service';
export async function GET() {
  const user = await AuthService.getCurrentUser();
  if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
  const profile = await ProfileService.getProfileByUserId(user.id);
  if (!profile) return NextResponse.json({ success: false, error: { message: 'Profile not found.', code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ success: true, data: { completeness: await ProfileService.calculateProfileCompleteness(profile, user.role === 'consultant' ? 'consultant' : 'client') } });
}
