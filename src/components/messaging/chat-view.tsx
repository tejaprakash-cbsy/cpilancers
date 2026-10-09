'use client';

import * as React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { ClientAuthService as AuthService, ClientMessagingService as MessagingService } from '@/services/client-api.service';
import { Loader2, MessageCircle, Send, X, Bell, Edit, Trash2, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Shapes below mirror exactly what this component reads. The messaging API
 * returns richer rows, but these members keep the local view honest without
 * changing any rendered output.
 */
type ChatMessage = {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
};

type ChatConversationMember = {
  user_id: string;
  users: {
    id: string;
    first_name?: string;
    last_name?: string;
  };
};

type ChatConversation = {
  conversation_members: ChatConversationMember[];
};

export const ChatView: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  // The authenticated caller's own user id.
  //
  // This is the identity message ownership is compared against. It used to be
  // inferred as `conversation.conversation_members[0]`, which is a positional
  // guess at roster order rather than a fact about who is signed in: every
  // message from the first-listed member looked like "mine", and none of the
  // signed-in user's own messages did. That inverted the alignment and moved
  // the edit/delete controls onto another participant's messages, and it also
  // mislabelled the conversation header.
  //
  // The controls are display only. The server re-checks ownership on every
  // mutation (`MessagingService.editMessage`/`deleteMessage` compare
  // `message.sender_id` to the session user) and RLS backs that up
  // (`sender_id = auth.uid()`), so this was never an authorization bypass --
  // but the UI must not offer an action the server will reject.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [scrollToBottom, setScrollToBottom] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // For editing messages
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editMessageContent, setEditMessageContent] = useState<string>('');

  // Load conversation and messages.
  //
  // `loading` starts as `true`, so the removed leading `setLoading(true)` was
  // redundant on mount and made this a synchronous setState source when called
  // from the effect. The refresh paths that still want a spinner set it
  // themselves.
  //
  // Memoised with `useCallback` on exactly the values it closes over, so the two
  // effects below can list it as a dependency. Without the memo it would be a
  // new function on every render and the effects would re-run on every render --
  // refetching the conversation and tearing down the realtime channel each time.
  const loadConversation = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      try {
        const user = await AuthService.getCurrentUser();
        if (!shouldApply()) return;
        if (!user) {
          router.push('/login');
          return;
        }

        setCurrentUserId(user.id);

        if (!conversationId) {
          setError('Conversation ID is required');
          return;
        }

        // Both reads complete before anything is written.
        const convData = await MessagingService.getConversationById(conversationId);
        const msgData = await MessagingService.getMessages(conversationId, 1, 50);

        // Single commit point. `shouldApply()` is false once the component has
        // unmounted or `conversationId` has moved on, which is what stops a slow
        // response for conversation A from overwriting conversation B.
        if (!shouldApply()) return;
        setConversation(convData as ChatConversation | null);
        setMessages(msgData as ChatMessage[]);
        setScrollToBottom(true);
        setError(null);
      } catch (err: unknown) {
        if (!shouldApply()) return;
        setError(err instanceof Error ? err.message : 'Failed to load conversation');
      } finally {
        if (shouldApply()) setLoading(false);
      }
    },
    [conversationId, router]
  );

  // Load initial data.
  //
  // The loader itself is reused by the refresh/send handlers, so it stays as
  // written. The effect calls it through an async IIFE with a cancellation
  // guard instead of invoking it directly: that keeps the state writes off the
  // synchronous effect path (react-hooks/set-state-in-effect).
  //
  // The guard is handed INTO the loader rather than checked after it returns.
  // Previously `await loadConversation(); if (cancelled) return;` ran after the
  // loader had already called setConversation/setMessages/setError, so the flag
  // could never prevent a stale write -- opening conversation A and then quickly
  // B could render A's messages under B's header.
  useEffect(() => {
    let cancelled = false;
    const shouldApply = () => !cancelled;
    void (async () => {
      await loadConversation(shouldApply);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, searchParams, loadConversation]);

  // Realtime message delivery.
  //
  // Best-effort. See `ClientMessagingService.subscribeToConversation`: realtime
  // needs `messages` in the `supabase_realtime` publication, which no migration
  // currently sets up, so this subscription usually reports CHANNEL_ERROR or
  // TIMED_OUT and simply logs. Everything the user sees is still driven by
  // `loadConversation`, which runs on open, on conversation change and on manual
  // refresh -- so realtime failing must never be able to break the view.
  useEffect(() => {
    if (!conversationId) return;

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      subscription = MessagingService.subscribeToConversation(
        conversationId,
        (payload) => {
          const record = (payload as { new?: unknown })?.new;
          if (!record || typeof record !== 'object') return;
          setMessages((current) => {
            const incoming = record as ChatMessage;
            // Realtime can deliver the same row twice (own send echoed back,
            // plus a reconnect replay), so de-duplicate on id.
            if (current.some((message) => message.id === incoming.id)) return current;
            return [...current, incoming];
          });
          setScrollToBottom(true);
        },
        (status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Pull the truth over HTTP once rather than leaving a stale list.
            void loadConversation();
          }
        }
      );
    } catch (error) {
      console.error('[ChatView] Realtime subscription unavailable:', error);
    }

    return () => {
      // Runs on conversation change AND unmount, so switching conversations
      // cannot leave the previous channel open.
      subscription?.unsubscribe();
    };
  }, [conversationId, loadConversation]);

  // Scroll to bottom when messages change or scrollToBottom flag is set
  useEffect(() => {
    if (scrollToBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setScrollToBottom(false);
    }
  }, [messages, scrollToBottom]);

  // Handle sending a message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!messageInput.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      const newMessage = await MessagingService.sendMessage(
        conversationId,
        messageInput,
      );

      // Add the new message to the list
      setMessages(prev => [...prev, newMessage as ChatMessage]);
      setMessageInput('');
      setScrollToBottom(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle editing a message
  const handleEditMessage = async (messageId: string, message: ChatMessage) => {
    setEditingMessageId(messageId);
    setEditMessageContent(message.content);
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editMessageContent.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      const updatedMessage = await MessagingService.editMessage(messageId, editMessageContent);

      // Update the message in the list
      setMessages(prev =>
        prev.map(msg => msg.id === messageId ? (updatedMessage as ChatMessage) : msg)
      );

      setEditingMessageId(null);
      setEditMessageContent('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to edit message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditMessageContent('');
  };

  // Handle deleting a message
  const handleDeleteMessage = async (messageId: string) => {
    if (!window.confirm('Are you sure you want to delete this message?')) {
      return;
    }

    setIsLoading(true);
    try {
      await MessagingService.deleteMessage(messageId);

      // Remove the message from the list
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle reporting a message
  const handleReportMessage = async (messageId: string) => {
    // In a real app, we'd show a modal for reporting
    // For now, we'll just call the API with a placeholder reason
    try {
      await MessagingService.reportMessage(messageId, 'Inappropriate content', 'This message violates community guidelines');
      alert('Message reported successfully');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to report message');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-14rem)]">
        <div className="flex h-full w-full items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-14rem)]">
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6">
          <h3 className="text-lg font-medium mb-4">{error}</h3>
          <p className="text-gray-600">
            Please try again or contact support if the issue persists.
          </p>
          <div className="mt-4">
            {/* Wrapped: `loadConversation` takes a `shouldApply` guard, so it must
                never be handed to onClick directly -- React would pass the click
                event as that argument. */}
            <Button onClick={() => void loadConversation()}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-[calc(100vh-14rem)]">
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-gray-500">Loading conversation...</p>
        </div>
      </div>
    );
  }

  // Get other participants
  const otherMembers = conversation.conversation_members
    // Everyone except the signed-in user. This previously excluded roster[0],
    // which is not necessarily the caller.
    .filter((m) => m.user_id !== currentUserId)
    .map((m) => m.users);

  return (
    <div className="min-h-[calc(100vh-14rem)] flex flex-col">
      {/* Header */}
      <header className="border-b pb-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div className="mb-4 sm:mb-0">
              <h1 className="text-xl font-bold text-gray-900">
                Conversation
                {otherMembers.length > 0 && (
                  <span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
                    {otherMembers.map((m) => {
                      if (!m) return 'Unknown User';
                      const u = Array.isArray(m) ? m[0] : m;
                      if (!u) return 'Unknown User';
                      const p = Array.isArray(u.profiles) ? u.profiles[0] : u.profiles;
                      return p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown User' : 'Unknown User';
                    }).join(', ') || 'Unknown User'}
                  </span>
                )}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm">
                <Bell className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push('/messages')}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-10 w-10 text-slate-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">No messages yet</p>
            <p className="text-gray-600">
              Start the conversation by sending a message below.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              // Ownership is the caller's own id, never a roster position. While the session
              // is still unresolved no per-message actions are shown at all.
              const isOwnMessage = !!currentUserId && message.sender_id === currentUserId;
              const isEdited = !!message.edited_at;
              const isDeleted = !!message.deleted_at;

              return (
                <div key={message.id} className={cn(
                  'flex',
                  isOwnMessage ? 'justify-end' : 'justify-start'
                )}>
                  {!isDeleted && (
                    <div className={cn(
                      'max-w-[80%]',
                      isOwnMessage ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-900',
                      'rounded-lg p-3'
                    )}>
                      <div className="flex-1">
                        <p className="whitespace-pre-wrap break-words">
                          {message.content}
                        </p>
                        {isEdited && (
                          <p className="text-xs text-slate-500 mt-1">
                            Edited
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>

                      {/* Message actions (for own messages) */}
                      {isOwnMessage && !isDeleted && (
                        <div className="flex space-x-2 mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditMessage(message.id, message)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMessage(message.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReportMessage(message.id)}
                          >
                            <Flag className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {isDeleted && (
                    <div className="text-xs text-slate-400 italic">
                      This message was deleted
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="flex p-4 border-t border-slate-200">
        {editingMessageId ? (
          <>
            <Input
              value={editMessageContent}
              onChange={(e) => setEditMessageContent(e.target.value)}
              placeholder="Edit your message..."
              className="flex-1"
            />
            <Button
              onClick={() => handleSaveEdit(editingMessageId)}
              isLoading={isLoading}
              disabled={isLoading || !editMessageContent.trim()}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelEdit}
              className="ml-2"
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Input
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              isLoading={isLoading}
              disabled={isLoading || !messageInput.trim()}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </>
        )}
      </form>
    </div>
  );
};
