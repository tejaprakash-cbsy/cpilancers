import { NextResponse } from 'next/server';
import { ProfileService } from '@/services/profile.service';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { const { id } = await context.params; const data = await ProfileService.getProfileByUserId(id); if (!data) return NextResponse.json({ success: false }, { status: 404 }); return NextResponse.json({ success: true, data }); }
