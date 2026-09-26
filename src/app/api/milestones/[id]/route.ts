import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ContractService } from '@/services/contract.service';
import { milestoneStatusUpdateSchema, milestoneUpdateSchema } from '@/lib/validations/contract.schemas';
import { formatErrorResponse } from '@/lib/errors';

function id(request: NextRequest) { return request.nextUrl.pathname.split('/').filter(Boolean).pop()!; }

export async function PATCH(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
    const body = await request.json();
    if (body.status) {
      const input = milestoneStatusUpdateSchema.parse(body);
      return NextResponse.json({ success: true, data: await ContractService.transitionMilestone(id(request), user.id, input.status, input.note) });
    }
    const input = milestoneUpdateSchema.parse(body);
    return NextResponse.json({ success: true, data: await ContractService.updateMilestone(id(request), user.id, input) });
  } catch (error) {
    const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
