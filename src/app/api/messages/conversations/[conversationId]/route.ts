/**
 * Conversation Detail API
 * GET    /api/messages/conversations/[conversationId]     — Get conversation details
 * GET    /api/messages/conversations/[conversationId]/messages — Get messages for conversation
 * POST   /api/messages/conversations/[conversationId]/messages — Send a message
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/services/auth.service';
import { MessagingService } from '@/services/messaging.service';
import { formatErrorResponse } from '@/lib/errors';

// Helper to get conversation ID from route params
function getConversationId(request: NextRequest): string | null {
  const match = request.nextUrl.pathname.match(/\/api\/messages\/conversations\/([^/]+)/);
  return match ? match[1] : null;
}

export async function GET(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const conversationId = getConversationId(request);
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: { message: 'Conversation ID is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    const conversation = await MessagingService.getConversationById(conversationId);

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: { message: 'Conversation not found.', code: 'NOT_FOUND' }, statusCode: 404 },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: conversation }, { status: 200 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}

// Messages sub-route
export async function GET_MESSAGES(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const conversationId = getConversationId(request);
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: { message: 'Conversation ID is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    // Get query parameters for pagination
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const messages = await MessagingService.getMessages(conversationId, page, limit);

    return NextResponse.json({ success: true, data: messages }, { status: 200 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}

export async function POST_MESSAGES(request: NextRequest) {
  try {
    const user = await AuthService.getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { message: 'Authentication required.', code: 'UNAUTHORIZED' }, statusCode: 401 },
        { status: 401 }
      );
    }

    const conversationId = getConversationId(request);
    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: { message: 'Conversation ID is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { content, attachments } = body;

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: { message: 'Message content is required.', code: 'VALIDATION_ERROR' }, statusCode: 400 },
        { status: 400 }
      );
    }

    // Convert attachments to File objects if needed (in real implementation, this would come from FormData)
    // For now, we'll assume attachments are already File objects from client
    // In a real implementation, we'd use FormData from request.formData()
    
    const message = await MessagingService.sendMessage(
      conversationId,
      content,
      attachments
    );

    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (error) {
    const formatted = formatErrorResponse(error);
    return NextResponse.json(
      { success: false, error: formatted.error, statusCode: formatted.statusCode },
      { status: formatted.statusCode }
    );
  }
}

// Since we can't have multiple exports with the same name, we need to handle different HTTP methods in one export
// But Next.js route handlers don't support multiple functions for different paths in the same file
// So we need to create separate route files for different paths

// Actually, let's restructure: we'll have:
// - src/app/api/messages/conversations/[conversationId]/route.ts for GET conversation
// - src/app/api/messages/conversations/[conversationId]/messages/route.ts for GET/POST messages