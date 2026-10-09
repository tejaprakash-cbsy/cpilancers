import { createAdminClient } from '../src/lib/supabase/admin';

async function main() {
  const supabase = createAdminClient();
  const { data: users } = await supabase.from('users').select('id, email');
  
  const client = users?.find((u) => u.email === 'client.qa.test@example.com');
  const consultant = users?.find((u) => u.email === 'consultant.qa.test@example.com');
  
  if (!client || !consultant) {
    console.error('Test users not found.');
    return;
  }
  
  // Insert conversation
  const { data: conv, error: convErr } = await supabase.from('conversations').insert({
    title: 'QA Test Conversation', created_by: client.id,
    conversation_type: 'direct_inquiry',
  }).select().single();
  
  if (convErr) {
    console.error(convErr);
    return;
  }
  
  // Insert participants
  await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: client.id, member_role: 'participant' },
    { conversation_id: conv.id, user_id: consultant.id, member_role: 'participant' }
  ]);
  
  console.log(`Created conversation ${conv.id}`);
}

main().catch(console.error);
