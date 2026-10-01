/**
 * Conversations API
 * GET    /api/messages/conversations     — List conversations for current user
 * POST   /api/messages/conversations     — Create a new conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { MessagingService } from '@/services/messaging.service';
import { AppError } from '@/lib/errors';

export async function GET() {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const conversations = await MessagingService.getUserConversations();

    return NextResponse.json({ success: true, data: conversations }, { status: 200 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { participantIds, conversationType, title, jobId, proposalId, contractId } = body;

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { message: 'Participant IDs are required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    const conversation = await MessagingService.createConversation(participantIds, {
      conversationType,
      title,
      jobId,
      proposalId,
      contractId,
    });

    return NextResponse.json({ success: true, data: conversation }, { status: 201 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}

function formatErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
      statusCode: error.statusCode,
    };
  }

  const err = error as Error;
  console.error('[Unhandled Server Error]:', err);

  return {
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred. Please try again later.'
        : err?.message || 'Unknown server error',
      code: 'INTERNAL_SERVER_ERROR',
    },
    statusCode: 500,
  };
}
