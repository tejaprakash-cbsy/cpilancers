import { NextResponse } from 'next/server';
import { ProfileService } from '@/services/profile.service';
export async function GET() { return NextResponse.json({ success: true, data: await ProfileService.getSkills() }); }
