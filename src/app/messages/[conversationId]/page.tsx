import type { Metadata } from 'next';
import { ChatView } from '@/components/messaging/chat-view';

export const metadata: Metadata = {
  title: 'Conversation | CPI Lancers',
  description: 'View and reply to messages in a conversation',
};

export default function ConversationPage() {
  return (
    <ChatView />
  );
}
