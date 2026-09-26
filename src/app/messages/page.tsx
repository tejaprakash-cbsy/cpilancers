import type { Metadata } from 'next';
import { ConversationList } from '@/components/messaging/conversation-list';

export const metadata: Metadata = {
  title: 'Messages | CPI Lancers',
  description: 'View and manage your conversations',
};

export default function MessagesPage() {
  return (
    <ConversationList />
  );
}
