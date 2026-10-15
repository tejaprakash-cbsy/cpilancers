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
} from '@/types/database';
import {
  AppError,
  UnauthorizedError,
  ValidationError,
} from '@/lib/errors';

// NOTE: `UserRole` and `ForbiddenError` were imported but never used. Role and
// permission checks in this file are membership-based (is the caller a
// participant?) rather than role-based, so neither had a call site.

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

/**
 * Row shapes returned by the messaging queries below.
 *
 * These were all `any`. That is not merely a style issue: several of these
 * values are read by the conversation-list UI and by the membership checks, and
 * an `any` there means a renamed or dropped column would surface as
 * `undefined` at runtime rather than as a compile error.
 */

/** A `conversations` row as embedded in the conversation-list query. */
export interface ConversationSummary {
  id: string;
  conversation_type: ConversationType;
  job_id: string | null;
  proposal_id: string | null;
  contract_id: string | null;
  title: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string | null;
}

/** What `getUserConversations` hands back: the conversation plus this user's membership state. */
export type ConversationListItem = ConversationSummary & {
  last_read_at: string | null;
  is_muted: boolean | null;
  joined_at: string;
};

/** A `messages` row, with the conversation metadata the chat view renders. */
export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachments: MessageAttachment[] | null;
  reply_to_message_id: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  sender?: { user_id: string; profiles: { first_name: string | null; last_name: string | null; display_name: string | null; avatar_url: string | null } | null } | null;
}

/** Metadata for an uploaded attachment. */
export interface MessageAttachment {
  url: string;
  name: string;
  size: number;
  type: string;
}

/**
 * The public profile fields joined onto a user.
 *
 * `profiles` is the RAW embed shape as PostgREST returns it for a to-one
 * relation: a single-element ARRAY. `readUserRow` normalises it to a single
 * object (or null), which is what `JoinedUserProfile` declares and what every
 * consumer reads.
 */
export type JoinedProfilesEmbed =
  | { first_name: string | null; last_name: string | null; display_name: string | null; avatar_url: string | null }
  | { first_name: string | null; last_name: string | null; display_name: string | null; avatar_url: string | null }[]
  | null;

export interface JoinedUserProfile {
  id: string;
  email: string;
  /** Normalised by `readUserRow`: always an object or null, never an array. */
  profiles: { first_name: string | null; last_name: string | null; display_name: string | null; avatar_url: string | null } | null;
}

/**
 * A `conversation_members` row with the joined user, for the roster view.
 *
 * `users` carries the RAW embed, in which `profiles` is still an array; that is
 * why this is distinct from `JoinedUserProfile`.
 */
export interface ConversationMemberRowWithUser {
  user_id: string;
  member_role: ConversationMemberRole;
  last_read_at: string | null;
  joined_at: string;
  users: {
    id: string;
    email: string;
    profiles: JoinedProfilesEmbed;
  } | { id: string; email: string; profiles: JoinedProfilesEmbed }[] | null;
}

/** Normalise a to-one embed that may arrive as an object or a one-element array. */
function readUserRow(embed: ConversationMemberRowWithUser['users']): JoinedUserProfile | null {
  if (!embed) return null;
  const base = Array.isArray(embed) ? embed[0] : embed;
  if (!base) return null;
  return {
    id: base.id,
    email: base.email,
    // PostgREST returns an embedded to-one relation as a single-element ARRAY
    // when the select is written `profiles(first_name, ...)`, so the nested
    // embed needs the same normalisation as the `users` embed above. Previously
    // the select used the invalid `profiles:first_name` form, so this never
    // round-tripped and the declared type hid the mismatch.
    profiles: Array.isArray(base.profiles)
      ? base.profiles[0] ?? null
      : base.profiles ?? null,
  };
}

/**
 * The result of uploading one attachment to storage, as returned by
 * `uploadAttachment` and consumed by `sendMessage` when it writes the
 * `message_attachments` row. The camelCase keys here are mapped to snake_case
 * columns at the insert site.
 */
export interface UploadedAttachment {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
}

/** A stored `notifications` row. */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

/** Payload delivered by a Supabase realtime `postgres_changes` INSERT. */
export interface RealtimeMessagePayload {
  new: Partial<MessageRow> & Record<string, unknown>;
  old: Record<string, unknown>;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  schema: string;
  table: string;
  commit_timestamp: string;
}

export class MessagingService {
  /**
   * Get all conversations for the current user
   */
  static async getUserConversations(): Promise<ConversationListItem[]> {
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
        // Order by the embedded conversation's `last_message_at`, newest first.
        //
        // The column name must be given BARE here. `foreignTable` already
        // prefixes the embedded table, so writing 'conversations.last_message_at'
        // produced the double-qualified `conversations.last_message_at.desc`,
        // which PostgREST rejected with PGRST100 ("failed to parse order") and
        // which made this endpoint 500 for every caller.
        .order('last_message_at', { foreignTable: 'conversations', ascending: false });

      if (error) {
        console.error('[DB Error - Get User Conversations]:', error);
        throw new AppError('Failed to load conversations', 500);
      }

      // Flattened from the membership row: the embedded `conversations` value is
      // a to-one embed, so it is normalised here rather than assumed to be an
      // object. Rows whose embed came back empty are dropped instead of being
      // spread into a list item with no `id`, which would have rendered as an
      // unopenable conversation in the sidebar.
      const transformedConversations = (conversations ?? [])
        .map((conv): ConversationListItem | null => {
          const embedded = Array.isArray(conv.conversations)
            ? conv.conversations[0]
            : conv.conversations;
          if (!embedded) return null;
          return {
            ...embedded,
            last_read_at: conv.last_read_at,
            is_muted: conv.is_muted,
            joined_at: conv.joined_at,
          };
        })
        .filter((item): item is ConversationListItem => item !== null);

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
  static async getConversationById(conversationId: string): Promise<ConversationSummary | null> {
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
            users:users!inner(id, email, role, profiles(first_name, last_name, display_name, avatar_url))
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
  static async getMessages(conversationId: string, page: number = 1, limit: number = 50): Promise<MessageRow[]> {
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

      // The `sender` embed MUST stay a LEFT JOIN (plain `users(...)`).
      //
      // `public.users` is protected by `users_select_self`
      // (SELECT USING (id = auth.uid())), so a reader can only ever see their
      // own users row. With the previous `users!inner(...)` this embed became an
      // INNER JOIN against that self-only table, which silently DROPPED every
      // message sent by somebody else. `messages_select_member` correctly allows
      // a conversation member to read the whole conversation, but the inner join
      // overrode that: each participant saw only their own messages and the chat
      // looked permanently empty. Found during browser QA when a consultant
      // received nothing over Realtime -- the cause was this read, not delivery.
      //
      // Do not "optimise" this back to `!inner`.
      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:users(id, email, profiles(first_name, last_name, display_name, avatar_url))
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
  ): Promise<MessageRow> {
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
      const attachmentResults: UploadedAttachment[] = [];
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
  ): Promise<ConversationSummary> {
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
  static async getConversationMembers(conversationId: string, excludeUserId?: string): Promise<ConversationMemberRowWithUser[]> {
    try {
      const supabase = await createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new UnauthorizedError('User not authenticated');
      }

      // Membership gate. Without this check any authenticated user could pass an
      // arbitrary conversationId and enumerate that conversation's roster --
      // user_id, member_role and the joined `users` row including email and
      // name -- for conversations they have no part in. Membership is verified
      // before the member list is read, mirroring getConversationById /
      // getMessages / sendMessage.
      const { data: membership, error: membershipError } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) {
        console.error('[DB Error - Assert Conversation Membership]:', membershipError);
        throw new UnauthorizedError('You are not a participant in this conversation');
      }
      if (!membership) {
        throw new UnauthorizedError('You are not a participant in this conversation');
      }

      let query = supabase
        .from('conversation_members')
        .select(`
          user_id,
          member_role,
          last_read_at,
          joined_at,
          users:user_id (id, email, profiles(first_name, last_name, display_name, avatar_url))
        `)
        .eq('conversation_id', conversationId);

      if (excludeUserId) {
        query = query.neq('user_id', excludeUserId);
      }

      const { data: members, error } = await query;

      if (error) {
        console.error('[DB Error - Get Conversation Members]:', error);
        throw new AppError('Failed to load conversation members.', 500, 'MEMBERS_FETCH_ERROR', error);
      }

      // Normalise the `users` embed so consumers see a single object rather
      // than having to branch on PostgREST's response shape.
      return ((members ?? []) as ConversationMemberRowWithUser[]).map((member) => ({
        ...member,
        users: readUserRow(member.users),
      }));
    } catch (error) {
      // Authorization failures must surface. Returning `[]` for a
      // non-participant is indistinguishable from an empty conversation and
      // turns a refused request into a plausible-looking success.
      if (error instanceof AppError) throw error;
      console.error('[MessagingService.getConversationMembers]:', error);
      throw new AppError('Failed to load conversation members.', 500, 'MEMBERS_FETCH_ERROR', error);
    }
  }

  /**
   * Upload an attachment
   */
  static async uploadAttachment(file: File, userId: string): Promise<UploadedAttachment> {
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
      // The stored path is the only thing we need back; `uploadData` (which
      // also carries signed-URL helpers and metadata we do not use) was bound
      // but never read, so it was removed to avoid dead work on every upload.
      const { error: uploadError } = await supabase
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
  static async editMessage(messageId: string, newContent: string): Promise<MessageRow> {
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
  ): Promise<Record<string, unknown>> {
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
  static async getUnreadNotifications(): Promise<NotificationRow[]> {
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
    onMessage: (payload: RealtimeMessagePayload) => void
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
        (payload: RealtimeMessagePayload) => {
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
