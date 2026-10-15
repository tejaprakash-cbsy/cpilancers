import { NextRequest, NextResponse } from 'next/server';
import { ForumService } from '@/services/forum.service';
import { AuthService } from '@/services/auth.service';
import { formatErrorResponse, UnauthorizedError, ValidationError } from '@/lib/errors';
import { createReplySchema } from '@/lib/validations/forum.schemas';
import { checkReplyRateLimit } from '@/lib/security/forum-rate-limiter';
import { z } from 'zod';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Validate discussion UUID
    const idValidation = z.string().uuid().safeParse(id);
    if (!idValidation.success) {
      throw new ValidationError('Invalid discussion ID format.');
    }

    const user = await AuthService.getCurrentUser();
    if (!user) {
      throw new UnauthorizedError('Authentication required to post a reply.');
    }

    // Abuse / spam rate limit check
    checkReplyRateLimit(user.id);

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new ValidationError('Malformed JSON payload.');
    }

    const validation = createReplySchema.safeParse(rawBody);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      throw new ValidationError(issue?.message || 'Invalid reply input.', validation.error.issues);
    }

    const post = await ForumService.createPost({
      discussionId: id,
      body: validation.data.body,
      authorId: user.id,
    });

    return NextResponse.json({ success: true, data: post }, { status: 201 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(formatted, { status: formatted.statusCode });
  }
}
