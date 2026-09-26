import { NextResponse } from 'next/server';
import { ProfileService } from '@/services/profile.service';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const data = await ProfileService.getCompanyById(id);
  if (!data) return NextResponse.json({ success: false, error: { message: 'Company not found.', code: 'NOT_FOUND' } }, { status: 404 });
  const { id: companyId, legal_name, brand_name, website_url, industry, company_size, sap_footprint, logo_url, is_verified, created_at, updated_at } = data;
  return NextResponse.json({ success: true, data: { id: companyId, legal_name, brand_name, website_url, industry, company_size, sap_footprint, logo_url, is_verified, created_at, updated_at } });
}
