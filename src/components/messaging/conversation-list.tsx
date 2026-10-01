'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { ClientAuthService as AuthService, ClientMessagingService as MessagingService } from '@/services/client-api.service';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A row of `getUserConversations()`.
 *
 * This is `MessagingService.ConversationListItem` -- FLAT conversation metadata.
 * It deliberately does NOT declare `conversation_members`: the list endpoint
 * does not join the roster. The previous declaration invented a
 * `conversation_members` shape that the API never returns, which let the
 * component compile against a field that was always `undefined` at runtime.
 *
 * `last_message_at` is nullable (a conversation can exist with no messages yet)
 * and `is_muted` is nullable in the database, so both are `| null` here rather
 * than the non-null types the old declaration claimed.
 */
export interface Conversation {
  id: string;
  conversation_type: string;
  job_id: string | null;
  proposal_id: string | null;
  contract_id: string | null;
  title: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string | null;
  /** Membership state for the CURRENT user, flattened onto the row by the service. */
  last_read_at: string | null;
  is_muted: boolean | null;
  joined_at: string;
}

/**
 * `ClientMessagingService.getUserConversations` is typed `unknown[]` because the
 * wrapper cannot know the row shape of every endpoint it serves. This narrows it
 * to the `Conversation` shape declared above. The cast is still needed at the
 * boundary -- it is a real narrowing of an untyped payload, not a way to silence
 * a type error -- but it is now narrowing to the shape the service actually
 * returns rather than to a shape that does not exist.
 */
function toConversations(data: unknown): Conversation[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is Conversation =>
      typeof row === 'object' && row !== null && typeof (row as { id?: unknown }).id === 'string'
  );
}

export const ConversationList: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Load conversations.
  //
  // `loading` starts as `true`, so the removed leading `setLoading(true)` was
  // redundant on mount and made this a synchronous setState source when called
  // from the effect. `handleRefresh` sets its own `refreshing` flag for the
  // pull-to-refresh affordance.
  //
  // Memoised on exactly what it closes over so the effect can depend on it.
  // Without the memo it would be a new function each render and the effect
  // below would refetch the whole list on every render.
  const loadConversations = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      try {
        const user = await AuthService.getCurrentUser();
        if (!shouldApply()) return;
        if (!user) {
          router.push('/login');
          return;
        }

        const data = await MessagingService.getUserConversations();
        if (!shouldApply()) return;
        setConversations(toConversations(data));

        // Get unread count
        const count = await MessagingService.getUnreadMessageCount();
        if (!shouldApply()) return;
        setUnreadCount(count);

        setError(null);
      } catch (err: unknown) {
        if (!shouldApply()) return;
        setError(err instanceof Error ? err.message : 'Failed to load conversations');
      } finally {
        // Guarded: without this, a slow response that arrived after unmount
        // would still flip `loading`/`refreshing` and re-render a dead component.
        if (shouldApply()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [router]
  );

  // Load initial data. See chat-view for the rationale behind routing the
  // loader through an async IIFE with a cancellation guard.
  useEffect(() => {
    let cancelled = false;
    const shouldApply = () => !cancelled;
    void (async () => {
      await loadConversations(shouldApply);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, loadConversations]);

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
  };

  // Handle navigation to conversation
  const handleConversationClick = (conversationId: string) => {
    router.push(`/messages/${conversationId}`);
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-14rem)] py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <p className="ml-4 text-lg">Loading conversations...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-14rem)] py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-6">
            <h3 className="text-lg font-medium mb-4">{error}</h3>
            <p className="text-gray-600">
              Please try again or contact support if the issue persists.
            </p>
            <div className="mt-4">
              {/* Wrapped: `loadConversations` takes a `shouldApply` guard, so it must never
                  be handed to onClick directly -- React would pass the click event
                  as that argument, and `event` is not a function. */}
                <Button onClick={() => void loadConversations()}>Try Again</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-14rem)]">
      {/* Header */}
      <div className="border-b pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div className="mb-4 sm:mb-0">
              <h1 className="text-2xl font-bold text-gray-900">
                Messages
                {unreadCount > 0 && (
                  <span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
                    {unreadCount}
                  </span>
                )}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleRefresh}
                className={cn(refreshing && 'animate-spin')}
              >
                {refreshing ? 'Refreshing' : 'Refresh'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Conversations List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {conversations.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-10 w-10 text-slate-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">No conversations yet</p>
            <p className="text-gray-600">
              Start a conversation by visiting a job or consultant profile and clicking
              the &ldquo;Message&rdquo; button.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {conversations.map((conversation) => {
              // Other participants.
              //
              // `getUserConversations` returns `ConversationListItem[]`, which is
              // FLAT conversation metadata -- it does NOT include
              // `conversation_members` or any user join. The previous code read
              // `conversation.conversation_members.filter(...)` anyway, which
              // threw `TypeError: Cannot read properties of undefined` for every
              // conversation in a non-empty list, so the messages page could not
              // render at all once any conversation existed.
              //
              // The names genuinely live under `conversation_members[].users[].profiles`
              // and are not in this payload, so there is nothing real to show
              // here. `title` IS in the payload and is the honest label to use;
              // falling back to the conversation id keeps each row keyed and
              // clickable rather than fabricating a participant name.
              const label = conversation.title?.trim() || `Conversation ${conversation.id.slice(0, 8)}`;
              
              // The list endpoint returns conversation metadata only
              // (`MessagingService.getUserConversations`), not message bodies, so
              // there is nothing real to preview here. The previous hardcoded
              // "Last message preview..." string was displayed in the position of
              // a real last message; an honest empty state replaces it and the
              // timestamp still comes from `conversations.last_message_at`.
              const hasMessages = Boolean(conversation.last_message_at);
              const lastMessagePreview = hasMessages ? 'Open to read messages' : 'No messages yet';
              const lastMessageTime = hasMessages
                ? new Date(conversation.last_message_at as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';
              
              // Unread state.
              //
              // `last_message_at` is nullable. The old expression fell back to
              // `last_read_at || last_message_at`, which compared the read
              // timestamp against ITSELF whenever both were null-ish, and it passed
              // a possibly-null value straight into `new Date(...)` -- producing
              // `Invalid Date` and a silently-wrong unread badge.
              //
              // The honest rule: a conversation is unread when it has at least one
              // message and the current user has never read it.
              const hasUnread = Boolean(conversation.last_message_at) && !conversation.last_read_at;

              return (
                <Link
                  key={conversation.id}
                  href={`/messages/${conversation.id}`}
                  onClick={() => handleConversationClick(conversation.id)}
                  className={cn(
                    'flex p-4 hover:bg-slate-50',
                    hasUnread && 'bg-slate-50'
                  )}
                >
                  <div className="flex-shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                      {label.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1 ml-4 space-y-1">
                    <div className="flex justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {label}
                        </p>
                        <p className="text-sm text-slate-500 line-clamp-1">
                          {lastMessagePreview}
                        </p>
                      </div>
                      <div className="text-right text-xs">
                        <p className={cn(
                          hasUnread ? 'font-medium text-gray-900' : 'text-slate-400'
                        )}>
                          {lastMessageTime}
                        </p>
                        {hasUnread && (
                          <div className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white">
                            ●
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
