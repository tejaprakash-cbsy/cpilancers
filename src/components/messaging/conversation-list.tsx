'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ClientAuthService as AuthService, ClientMessagingService as MessagingService } from '@/services/client-api.service';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Conversation {
  id: string;
  conversation_type: string;
  job_id: string | null;
  proposal_id: string | null;
  contract_id: string | null;
  title: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  last_read_at: string | null;
  is_muted: boolean;
  joined_at: string;
  // Populated from the join
  conversation_members: {
    user_id: string;
    member_role: string;
    last_read_at: string | null;
    joined_at: string;
    users: {
      id: string;
      email: string;
      profiles: {
        first_name: string;
        last_name: string;
        display_name: string;
        avatar_url: string | null;
      };
    }[];
  }[];
}

export const ConversationList: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Load conversations
  const loadConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      const user = await AuthService.getCurrentUser();
      if (!user) {
        router.push('/auth/signin');
        return;
      }

      const data = await MessagingService.getUserConversations();
      setConversations(data as Conversation[]);

      // Get unread count
      const count = await MessagingService.getUnreadMessageCount();
      setUnreadCount(count);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load initial data
  useEffect(() => {
    loadConversations();
  }, [searchParams]);

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
              <Button onClick={loadConversations}>Try Again</Button>
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
              // Get the other participant(s) in the conversation
              // NOTE: `users` is an array joined from the API, but the existing UI
              // reads `first_name`/`last_name` directly off it (they actually live
              // under `users[].profiles`). That mismatch is a pre-existing bug and
              // is preserved here to avoid changing rendered output.
              const otherMembers = conversation.conversation_members
                .filter((m) => m.user_id !== conversation.conversation_members[0]?.users?.[0]?.id)
                .map((m) => m.users as unknown as { first_name?: string; last_name?: string });
              
              // Get the last message (we'd need to fetch this separately in a real app)
              // For now, we'll just show placeholder
              const lastMessagePreview = 'Last message preview...';
              const lastMessageTime = new Date(conversation.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              
              // Check if conversation has unread messages
              const hasUnread = !conversation.last_read_at || 
                new Date(conversation.last_message_at) > new Date(conversation.last_read_at || conversation.last_message_at);

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
                    {otherMembers.length > 0 ? (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                        {otherMembers[0].first_name?.charAt(0) || 'U'}
                        {otherMembers[0].last_name?.charAt(0) || ''}
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                        {'?'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 ml-4 space-y-1">
                    <div className="flex justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {otherMembers.map((m) => `${m.first_name} ${m.last_name}`).join(', ') || 'Unknown User'}
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
