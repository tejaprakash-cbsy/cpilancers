import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ContractService } from '@/services/contract.service';
import { contractCreateSchema } from '@/lib/validations/contract.schemas';
import { formatErrorResponse } from '@/lib/errors';

export async function GET() {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
    return NextResponse.json({ success: true, data: await ContractService.listContracts(user.id) });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
    if (user.role !== 'client') return NextResponse.json({ success: false, error: { message: 'Only clients can create contracts.', code: 'FORBIDDEN' } }, { status: 403 });
    const input = contractCreateSchema.parse(await request.json());
    const contract = await ContractService.createContract(user.id, {
      ...input,
      contract_type: input.contract_type || (input.payment_structure === 'hourly_capped' ? 'hourly' : 'fixed_price'),
    });
    return NextResponse.json({ success: true, data: contract }, { status: 201 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
