import { NextResponse } from 'next/server';
import { ProfileService } from '@/services/profile.service';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const data = await ProfileService.getPublicClientProfile(id);
  if (!data) return NextResponse.json({ success: false, error: { message: 'Client profile not found.', code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ success: true, data });
}
