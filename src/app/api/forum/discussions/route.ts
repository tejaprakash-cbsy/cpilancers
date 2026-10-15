import { NextRequest, NextResponse } from 'next/server';
import { ForumService } from '@/services/forum.service';
import { AuthService } from '@/services/auth.service';
import { formatErrorResponse, UnauthorizedError, ValidationError } from '@/lib/errors';
import { createDiscussionSchema } from '@/lib/validations/forum.schemas';
import { checkDiscussionRateLimit } from '@/lib/security/forum-rate-limiter';

export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      throw new UnauthorizedError('Authentication required to create a discussion.');
    }

    // Abuse / spam rate limit check
    checkDiscussionRateLimit(user.id);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new ValidationError('Malformed JSON payload.');
    }

    const validation = createDiscussionSchema.safeParse(rawBody);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      throw new ValidationError(issue?.message || 'Invalid discussion input.', validation.error.issues);
    }

    const { categoryId, title, body } = validation.data;

    const discussion = await ForumService.createDiscussion({
      categoryId,
      title,
      body,
      authorId: user.id,
    });

    return NextResponse.json({ success: true, data: discussion }, { status: 201 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
