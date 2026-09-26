import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ContractService } from '@/services/contract.service';
import { milestoneCreateSchema } from '@/lib/validations/contract.schemas';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatErrorResponse } from '@/lib/errors';

function id(request: NextRequest) { return request.nextUrl.pathname.split('/').filter(Boolean).at(-2)!; }

export async function GET(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
    await ContractService.getContract(id(request), user.id);
    const { data, error } = await createAdminClient().from('milestones').select('*').eq('contract_id', id(request)).order('sequence_order');
    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
    const input = milestoneCreateSchema.parse({ ...(await request.json()), contract_id: id(request) });
    const milestone = await ContractService.createMilestone(user.id, input);
    return NextResponse.json({ success: true, data: milestone }, { status: 201 });
  } catch (error) {
    const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
