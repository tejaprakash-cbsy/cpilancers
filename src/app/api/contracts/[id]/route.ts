import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ContractService } from '@/services/contract.service';
import { contractStatusEnum } from '@/lib/validations/contract.schemas';
import { formatErrorResponse, ValidationError } from '@/lib/errors';

function id(request: NextRequest) { return request.nextUrl.pathname.split('/').filter(Boolean).pop()!; }

export async function GET(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
    return NextResponse.json({ success: true, data: await ContractService.getContract(id(request), user.id) });
  } catch (error) {
    const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
    const body = await request.json();
    const parsed = contractStatusEnum.safeParse(body.status);
    if (!parsed.success) throw new ValidationError('A valid contract status is required.');
    return NextResponse.json({ success: true, data: await ContractService.transitionContract(id(request), user.id, parsed.data) });
  } catch (error) {
    const formatted = formatErrorResponse(error); return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
