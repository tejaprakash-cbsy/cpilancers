import { NextRequest, NextResponse } from 'next/server';
import { ForumService } from '@/services/forum.service';
import { AuthService } from '@/services/auth.service';
import { formatErrorResponse, ForbiddenError, ValidationError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) throw new ForbiddenError('Authentication required.');

    const body = await request.json();
    if (!body.title?.trim() || !body.body?.trim() || !body.categoryId) {
      throw new ValidationError('Missing required fields.');
    }

    if (body.title.length > 150) {
      throw new ValidationError('Title too long.');
    }

    const discussion = await ForumService.createDiscussion({
      categoryId: body.categoryId,
      title: body.title,
      body: body.body,
      authorId: user.id,
    });

    return NextResponse.json({ success: true, data: discussion }, { status: 201 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
