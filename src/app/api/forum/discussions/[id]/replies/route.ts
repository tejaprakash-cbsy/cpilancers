import { NextRequest, NextResponse } from 'next/server';
import { ForumService } from '@/services/forum.service';
import { AuthService } from '@/services/auth.service';
import { formatErrorResponse, ForbiddenError, ValidationError } from '@/lib/errors';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await AuthService.getCurrentUser();
    if (!user) throw new ForbiddenError('Authentication required.');

    const body = await request.json();
    if (!body.body?.trim()) {
      throw new ValidationError('Missing required fields.');
    }

    const post = await ForumService.createPost({
      discussionId: id,
      body: body.body,
      authorId: user.id,
    });

    return NextResponse.json({ success: true, data: post }, { status: 201 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
