/**
 * Messaging Service
 * Handles all messaging operations with Supabase including realtime capabilities
 */

import { createClient } from '@/lib/supabase/server';
import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { NotificationService } from '@/services/notification.service';
import { messageReceived } from '@/lib/notifications/events';
import type { 
  ConversationType,
  ConversationMemberRole,
  NotificationType,
  UserRole
} from '@/types/database';
import {
  AppError,
  UnauthorizedError,
  ValidationError,
  ForbiddenError,
} from '@/lib/errors';

// Message validation constants
const MAX_MESSAGE_LENGTH = 5000;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/csv',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

// Rate limiting
const RATE_LIMIT_MESSAGES_PER_MINUTE = 10;
const RATE_LIMIT_TIME_WINDOW_MS = 60000; // 1 minute
const rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();

export class MessagingService {
  /**
   * Get all conversations for the current user
   */
  static async getUserConversations(): Promise<any[]> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Get conversations where the user is a participant
      const { data: conversations, error } = await supabase
        .from('conversation_members')
        .select(`
          conversation_id,
          last_read_at,
          is_muted,
          joined_at,
          conversations:conversation_id (
            id,
            conversation_type,
            job_id,
            proposal_id,
            contract_id,
            title,
            last_message_at,
            created_at,
            updated_at
          )
        `)
        .eq('user_id', user.id)
        .order('conversations.last_message_at', { foreignTable: 'conversations', ascending: false });
      
      if (error) {
        console.error('[DB Error - Get User Conversations]:', error);
        throw new AppError('Failed to load conversations', 500);
      }
      
      // Transform the data to be more usable
      const transformedConversations = conversations.map((conv: any) => ({
        ...conv.conversations,
        last_read_at: conv.last_read_at,
        is_muted: conv.is_muted,
        joined_at: conv.joined_at,
      }));
      
      return transformedConversations;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[MessagingService.getUserConversations]:', error);
      throw new AppError('Failed to load conversations', 500);
    }
  }

  /**
   * Get a single conversation by ID
   */
  static async getConversationById(conversationId: string): Promise<any | null> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Verify user is a participant in this conversation
      const { data: membership, error: memberError } = await supabase
        .from('conversation_members')
        .select('*')
        .match({
          conversation_id: conversationId,
          user_id: user.id,
        })
        .single();
      
      if (memberError || !membership) {
        throw new UnauthorizedError('You are not a participant in this conversation');
      }
      
      // Get conversation
      const { data: conversation, error } = await supabase
        .from('conversations')
        .select(`
          *,
          conversation_members:conversation_members!inner(
            user_id,
            users:users!inner(id, email, profiles:first_name, last_name, display_name, avatar_url, role)
          )
        `)
        .eq('id', conversationId)
        .single();
      
      if (error) {
        console.error('[DB Error - Get Conversation]:', error);
        throw new AppError('Failed to load conversation', 500);
      }
      
      return conversation;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[MessagingService.getConversationById]:', error);
      throw new AppError('Failed to load conversation', 500);
    }
  }

  /**
   * Get messages for a conversation with pagination
   */
  static async getMessages(conversationId: string, page: number = 1, limit: number = 50): Promise<any[]> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Verify user is a participant in this conversation
      const { data: membership, error: memberError } = await supabase
        .from('conversation_members')
        .select('*')
        .match({
          conversation_id: conversationId,
          user_id: user.id,
        })
        .single();
      
      if (memberError || !membership) {
        throw new UnauthorizedError('You are not a participant in this conversation');
      }
      
      // Get messages with pagination (newest first, then reverse for display oldest first)
      const offset = (page - 1) * limit;
      
      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:users!inner(id, email, profiles:first_name, last_name, display_name, avatar_url)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (error) {
        console.error('[DB Error - Get Messages]:', error);
        throw new AppError('Failed to load messages', 500);
      }
      
      // Reverse to show oldest first (for chat display)
      return messages.reverse();
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[MessagingService.getMessages]:', error);
      throw new AppError('Failed to load messages', 500);
    }
  }

  /**
   * Send a message
   */
  static async sendMessage(
    conversationId: string,
    content: string,
    attachments?: File[]
  ): Promise<any> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Verify user is a participant in this conversation
      const { data: membership, error: memberError } = await supabase
        .from('conversation_members')
        .select('*')
        .match({
          conversation_id: conversationId,
          user_id: user.id,
        })
        .single();
      
      if (memberError || !membership) {
        throw new UnauthorizedError('You are not a participant in this conversation');
      }
      
      // Rate limiting check
      const now = Date.now();
      const existingEntry = rateLimitStore.get(user.id);
      
      if (existingEntry) {
        // Reset count if the time window has passed
        if (now > existingEntry.resetTime) {
          rateLimitStore.set(user.id, { count: 1, resetTime: now + RATE_LIMIT_TIME_WINDOW_MS });
        } else {
          // Check if user has exceeded the rate limit
          if (existingEntry.count >= RATE_LIMIT_MESSAGES_PER_MINUTE) {
            throw new ValidationError(
              `Rate limit exceeded. Please wait ${Math.ceil((existingEntry.resetTime - now) / 1000)} seconds before sending another message.`
            );
          }
          
          // Increment the count
          rateLimitStore.set(user.id, { count: existingEntry.count + 1, resetTime: existingEntry.resetTime });
        }
      } else {
        // First message from this user
        rateLimitStore.set(user.id, { count: 1, resetTime: now + RATE_LIMIT_TIME_WINDOW_MS });
      }
      
      // Validate message content
      if (!content || content.trim().length === 0) {
        throw new ValidationError('Message content cannot be empty');
      }
      
      if (content.length > MAX_MESSAGE_LENGTH) {
        throw new ValidationError(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters`);
      }
      
      // Validate attachments
      if (attachments && attachments.length > 0) {
        if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
          throw new ValidationError(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message`);
        }
        
        for (const file of attachments) {
          if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
            throw new ValidationError(`File type ${file.type} is not allowed`);
          }
          
          if (file.size > MAX_ATTACHMENT_SIZE) {
            throw new ValidationError(`File size exceeds maximum of ${MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB`);
          }
        }
      }
      
      // Upload attachments first (if any)
      const attachmentResults: any[] = [];
      if (attachments && attachments.length > 0) {
        for (const file of attachments) {
          const uploadedAttachment = await this.uploadAttachment(file, user.id);
          attachmentResults.push(uploadedAttachment);
        }
      }
      
      // Insert message
      const { data: newMessage, error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content.trim(),
        })
        .select()
        .single();
      
      if (messageError) {
        await supabase.storage.from('message-attachments').remove(
          attachmentResults.map((attachment) => attachment.storagePath)
        );
        console.error('[DB Error - Send Message]:', messageError);
        throw new AppError('Failed to send message', 500);
      }
      
      // Update conversation's last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      
      // Get other participants to notify
      const otherMembers = await this.getConversationMembers(conversationId, user.id);
      
      // Create notifications for other participants. Keyed on the message id, so
      // every message in a thread notifies exactly once and a redelivered send
      // does not notify twice.
      for (const member of otherMembers) {
        await messageReceived(NotificationService.emitEvent, {
          recipientUserId: member.user_id,
          actorUserId: user.id,
          actorName: user.email ?? null,
          messageId: newMessage.id,
          conversationId,
        });
      }
      
      // If there are attachments, link them to the message
      if (attachmentResults.length > 0) {
        // Update message with attachment info or create attachment records
        for (let i = 0; i < attachmentResults.length; i++) {
          const attachment = attachmentResults[i];
          const { error: attachmentError } = await supabase
            .from('message_attachments')
            .insert({
              message_id: newMessage.id,
              file_name: attachment.fileName,
              file_size_bytes: attachment.fileSize,
              mime_type: attachment.mimeType,
              storage_path: attachment.storagePath,
            });
          
          if (attachmentError) {
            console.error('[DB Error - Link Attachment]:', attachmentError);
          }
        }
      }
      
      // Return the full message with attachments
      return {
        ...newMessage,
        attachments: attachmentResults,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[MessagingService.sendMessage]:', error);
      throw new AppError('Failed to send message', 500);
    }
  }

  /**
   * Mark message as read
   */
  static async markMessageAsRead(messageId: string): Promise<void> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Update the conversation_members record with last_read_message_id
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('id', messageId)
        .single();
      
      if (messageError) {
        console.error('[DB Error - Get Message for Read Status]:', messageError);
        return;
      }
      
      // Update the member's last_read_message_id
      const { error } = await supabase
        .from('conversation_members')
        .update({ 
          last_read_message_id: messageId,
          last_read_at: new Date().toISOString()
        })
        .match({
          conversation_id: message.conversation_id,
          user_id: user.id,
        });
      
      if (error) {
        console.error('[DB Error - Mark Message Read]:', error);
      }
    } catch (error) {
      console.error('[MessagingService.markMessageAsRead]:', error);
    }
  }

  /**
   * Get unread message count for the current user
   */
  static async getUnreadMessageCount(): Promise<number> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Get unread message count using the helper function
      const { data: { count }, error } = await supabase
        .rpc('get_unread_message_count', { user_uuid: user.id });
      
      if (error) {
        console.error('[DB Error - Get Unread Count]:', error);
        return 0;
      }
      
      return count || 0;
    } catch (error) {
      console.error('[MessagingService.getUnreadMessageCount]:', error);
      return 0;
    }
  }

  /**
   * Create a conversation
   */
  static async createConversation(
    participantIds: string[],
    options?: {
      conversationType?: ConversationType;
      title?: string;
      jobId?: string;
      proposalId?: string;
      contractId?: string;
    }
  ): Promise<any> {
    try {
      const supabase = await createClient();
      const adminSupabase = createAdminClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Ensure current user is in the participants list
      if (!participantIds.includes(user.id)) {
        participantIds.push(user.id);
      }
      
      // Create conversation
      const { data: conversation, error } = await adminSupabase
        .from('conversations')
        .insert({
          conversation_type: options?.conversationType || 'direct_inquiry',
          job_id: options?.jobId,
          proposal_id: options?.proposalId,
          contract_id: options?.contractId,
          title: options?.title,
          created_by: user.id,
        })
        .select()
        .single();
      
      if (error) {
        console.error('[DB Error - Create Conversation]:', error);
        throw new AppError('Failed to create conversation', 500);
      }
      
      // Add participants to conversation
      for (const participantId of participantIds) {
        const { error: memberError } = await adminSupabase
          .from('conversation_members')
          .insert({
            conversation_id: conversation.id,
            user_id: participantId,
            member_role: 'participant',
          });
        
        if (memberError) {
          await adminSupabase.from('conversations').delete().eq('id', conversation.id);
          throw new AppError('Failed to create conversation members', 500);
        }
      }
      
      return conversation;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[MessagingService.createConversation]:', error);
      throw new AppError('Failed to create conversation', 500);
    }
  }

  /**
   * Get conversation members
   */
  static async getConversationMembers(conversationId: string, excludeUserId?: string): Promise<any[]> {
    try {
      const supabase = await createClient();
      
      let query = supabase
        .from('conversation_members')
        .select(`
          user_id,
          member_role,
          last_read_at,
          joined_at,
          users:user_id (id, email, profiles:first_name, last_name, display_name, avatar_url)
        `)
        .eq('conversation_id', conversationId);
      
      if (excludeUserId) {
        query = query.neq('user_id', excludeUserId);
      }
      
      const { data: members, error } = await query;
      
      if (error) {
        console.error('[DB Error - Get Conversation Members]:', error);
        return [];
      }
      
      return members;
    } catch (error) {
      console.error('[MessagingService.getConversationMembers]:', error);
      return [];
    }
  }

  /**
   * Upload an attachment
   */
  static async uploadAttachment(file: File, userId: string): Promise<any> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Validate file
      if (!file) throw new ValidationError('No file provided');
      
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
        throw new ValidationError('File type is not allowed');
      }
      
      if (file.size > MAX_ATTACHMENT_SIZE) {
        throw new ValidationError('File size exceeds maximum allowed size');
      }
      
      // Create file path
      const fileExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;
      
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('message-attachments')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });
      
      if (uploadError) {
        console.error('[Storage Error - Upload Attachment]:', uploadError);
        throw new AppError('Failed to upload attachment', 500);
      }
      
      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        storagePath: filePath,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[MessagingService.uploadAttachment]:', error);
      throw new AppError('Attachment upload failed', 500);
    }
  }

  /**
   * Edit a message
   */
  static async editMessage(messageId: string, newContent: string): Promise<any> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Validate content
      if (!newContent || newContent.trim().length === 0) {
        throw new ValidationError('Message content cannot be empty');
      }
      
      if (newContent.length > MAX_MESSAGE_LENGTH) {
        throw new ValidationError('Message exceeds maximum length');
      }
      
      // Verify user is the sender
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();
      
      if (fetchError) {
        console.error('[DB Error - Get Message for Edit]:', fetchError);
        throw new AppError('Message not found', 404);
      }
      
      if (message.sender_id !== user.id) {
        throw new UnauthorizedError('You can only edit your own messages');
      }
      
      // Check if message was deleted
      if (message.deleted_at) {
        throw new AppError('Cannot edit a deleted message', 400);
      }
      
      // Update message
      const { data: result, error } = await supabase
        .from('messages')
        .update({ 
          content: newContent.trim(),
          edited_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .select()
        .single();
      
      if (error) {
        console.error('[DB Error - Edit Message]:', error);
        throw new AppError('Failed to edit message', 500);
      }
      
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[MessagingService.editMessage]:', error);
      throw new AppError('Failed to edit message', 500);
    }
  }

  /**
   * Delete a message (soft delete)
   */
  static async deleteMessage(messageId: string): Promise<void> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Verify user is the sender
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .single();
      
      if (fetchError) {
        console.error('[DB Error - Get Message for Delete]:', fetchError);
        throw new AppError('Message not found', 404);
      }
      
      if (message.sender_id !== user.id) {
        throw new UnauthorizedError('You can only delete your own messages');
      }
      
      // Soft delete
      const { error } = await supabase
        .from('messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', messageId);
      
      if (error) {
        console.error('[DB Error - Delete Message]:', error);
        throw new AppError('Failed to delete message', 500);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[MessagingService.deleteMessage]:', error);
      throw new AppError('Failed to delete message', 500);
    }
  }

  /**
   * Report a message
   */
  static async reportMessage(
    messageId: string,
    reason: string,
    description?: string
  ): Promise<any> {
    try {
      const supabase = await createClient();
      
      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      // Validate report
      if (!reason) {
        throw new ValidationError('Report reason is required');
      }
      
      // Get message details to find the conversation
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('conversation_id, sender_id, content')
        .eq('id', messageId)
        .single();
      
      if (fetchError) {
        console.error('[DB Error - Get Message for Report]:', fetchError);
        throw new AppError('Message not found', 404);
      }
      
      // Verify user is a participant in the conversation
      const { error: memberError } = await supabase
        .from('conversation_members')
        .select('*')
        .match({
          conversation_id: message.conversation_id,
          user_id: user.id,
        })
        .single();
      
      if (memberError) {
        throw new UnauthorizedError('You must be a participant in this conversation to report messages');
      }
      
      // Create a report record
      const { data: report, error } = await supabase
        .from('reports')
        .insert({
          reporter_user_id: user.id,
          target_type: 'message',
          target_id: messageId,
          reason: reason,
          description: description,
        })
        .select()
        .single();
      
      if (error) {
        console.error('[DB Error - Report Message]:', error);
        throw new AppError('Failed to report message', 500);
      }
      
      return report;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('[MessagingService.reportMessage]:', error);
      throw new AppError('Failed to report message', 500);
    }
  }

  /**
   * Create a notification.
   *
   * Retained as a generic escape hatch for callers that have no typed builder, and
   * delegated to NotificationService so the write is deduplicated, preference-aware
   * and recorded in the delivery ledger.
   *
   * `type` is now a validated `NotificationType` rather than a bare `string`. The
   * previous signature accepted any string and cast it with `as any` on the way to
   * the database, which moved the only real validation of this column from the
   * database into a comment. A caller passing a misspelled type now fails at
   * compile time and again at runtime, instead of producing a 22P02 from
   * PostgREST that the old code logged and swallowed.
   */
  static async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    actionUrl?: string,
    entityType?: string,
    entityId?: string
  ): Promise<void> {
    try {
      await NotificationService.emit({
        userId,
        type,
        title,
        body,
        actionUrl: actionUrl ?? null,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
      });
    } catch (error) {
      // Never propagated: a notification must not fail the message send that
      // triggered it. The message itself is already committed.
      console.error('[MessagingService.createNotification]:', error);
    }
  }

  /**
   * Get unread notifications for current user
   */
  static async getUnreadNotifications(): Promise<any[]> {
    try {
      const supabase = await createClient();
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }
      
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[DB Error - Get Unread Notifications]:', error);
        return [];
      }
      
      return notifications || [];
    } catch (error) {
      console.error('[MessagingService.getUnreadNotifications]:', error);
      return [];
    }
  }

  /**
   * Subscribe to real-time messages for a conversation
   */
  static subscribeToConversation(
    conversationId: string,
    onMessage: (payload: any) => void
  ) {
    const supabase = createBrowserClient();
    
    const channel = supabase
      .channel(`messages:conversation_id=eq.${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          onMessage(payload);
        }
      )
      .subscribe();
    
    return channel;
  }

  /**
   * Unsubscribe from real-time messages for a conversation
   */
  static unsubscribeFromConversation(conversationId: string) {
    const supabase = createBrowserClient();
    
    supabase
      .channel(`messages:conversation_id=eq.${conversationId}`)
      .unsubscribe();
  }
}

// Export rate limit cleanup helper for server-side cleanup
export function cleanupRateLimits() {
  const now = Date.now();
  for (const [userId, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(userId);
    }
  }
}
