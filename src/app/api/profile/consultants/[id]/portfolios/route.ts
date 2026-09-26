import { NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { ProfileService } from '@/services/profile.service';
import { portfolioFormSchema } from '@/lib/validations/profile.schemas';
import { formatErrorResponse } from '@/lib/errors';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.json({ success: true, data: await ProfileService.getPortfolios(id) });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await AuthService.getCurrentUser();
    const { id } = await context.params;
    if (!user) return NextResponse.json({ success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' } }, { status: 401 });
    const value = portfolioFormSchema.parse(await request.json());
    const data = await ProfileService.createPortfolio(user.id, id, { client_industry: value.clientIndustry, source_systems: value.sourceSystems, target_systems: value.targetSystems, protocols_used: value.protocolsUsed, title: value.title, challenge_markdown: value.challengeMarkdown, solution_markdown: value.solutionMarkdown, outcome_markdown: value.outcomeMarkdown || null, architecture_diagram_url: value.architectureDiagramUrl || null, completed_at: value.completedAt || null });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: unknown) { const result = formatErrorResponse(error); return NextResponse.json(result, { status: result.statusCode }); }
}
