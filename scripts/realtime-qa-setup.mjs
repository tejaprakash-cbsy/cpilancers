/**
 * Realtime QA Setup & Teardown Script
 * 
 * Creates QA users and conversation for Realtime testing,
 * then provides teardown to clean up all residue.
 * 
 * Usage:
 *   node scripts/realtime-qa-setup.mjs setup
 *   node scripts/realtime-qa-setup.mjs teardown
 *   node scripts/realtime-qa-setup.mjs verify-publication
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uzjvaijepqfiogwncdjn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const QA_CLIENT_EMAIL = 'qa-realtime-client@test.lancers.dev';
const QA_CONSULTANT_EMAIL = 'qa-realtime-consultant@test.lancers.dev';
const QA_OUTSIDER_EMAIL = 'qa-realtime-outsider@test.lancers.dev';
const QA_PASSWORD = 'QaR3altime!Test2026';

const QA_EMAILS = [QA_CLIENT_EMAIL, QA_CONSULTANT_EMAIL, QA_OUTSIDER_EMAIL];

async function setup() {
  console.log('=== REALTIME QA SETUP ===\n');
  
  // 1. Create QA users via admin auth
  const users = [];
  const roles = [
    { email: QA_CLIENT_EMAIL, role: 'client', first: 'QA-RT', last: 'Client' },
    { email: QA_CONSULTANT_EMAIL, role: 'consultant', first: 'QA-RT', last: 'Consultant' },
    { email: QA_OUTSIDER_EMAIL, role: 'client', first: 'QA-RT', last: 'Outsider' },
  ];

  for (const r of roles) {
    console.log(`Creating user: ${r.email}...`);
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email: r.email,
      password: QA_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: r.first, last_name: r.last }
    });
    if (authErr) {
      console.error(`  ERROR creating auth user ${r.email}:`, authErr.message);
      continue;
    }
    console.log(`  Auth user created: ${authUser.user.id}`);
    
    // Create public.users row
    const { error: userErr } = await admin.from('users').upsert({
      id: authUser.user.id,
      email: r.email,
      role: r.role,
      status: 'active',
      is_email_verified: true,
    }, { onConflict: 'id' });
    if (userErr) console.error(`  ERROR creating users row:`, userErr.message);
    else console.log(`  public.users row created`);

    // Create profile
    const { error: profErr } = await admin.from('profiles').upsert({
      user_id: authUser.user.id,
      first_name: r.first,
      last_name: r.last,
      display_name: `${r.first} ${r.last}`,
    }, { onConflict: 'user_id' });
    if (profErr) console.error(`  ERROR creating profile:`, profErr.message);
    else console.log(`  Profile created`);

    // Create role-specific profile
    if (r.role === 'client') {
      const { error } = await admin.from('client_profiles').upsert({
        user_id: authUser.user.id,
        company_name: 'QA Realtime Test Co',
      }, { onConflict: 'user_id' });
      if (error) console.error(`  ERROR creating client_profile:`, error.message);
    } else {
      const { error } = await admin.from('consultant_profiles').upsert({
        user_id: authUser.user.id,
        title: 'QA Tester',
        hourly_rate: 50,
        experience_years: 1,
        availability_status: 'available',
        bio: 'QA test account',
      }, { onConflict: 'user_id' });
      if (error) console.error(`  ERROR creating consultant_profile:`, error.message);
    }

    users.push({ ...r, id: authUser.user.id });
  }

  if (users.length < 3) {
    console.error('\nFailed to create all QA users. Aborting setup.');
    return;
  }

  const clientUser = users.find(u => u.email === QA_CLIENT_EMAIL);
  const consultantUser = users.find(u => u.email === QA_CONSULTANT_EMAIL);
  const outsiderUser = users.find(u => u.email === QA_OUTSIDER_EMAIL);

  // 2. Create conversation between client and consultant
  console.log('\nCreating conversation...');
  const { data: conversation, error: convErr } = await admin.from('conversations').insert({
    conversation_type: 'direct_inquiry',
    title: 'QA Realtime Test Conversation',
    created_by: clientUser.id,
  }).select().single();

  if (convErr) {
    console.error('ERROR creating conversation:', convErr.message);
    return;
  }
  console.log(`  Conversation created: ${conversation.id}`);

  // Add members
  for (const member of [clientUser, consultantUser]) {
    const { error } = await admin.from('conversation_members').insert({
      conversation_id: conversation.id,
      user_id: member.id,
      member_role: 'participant',
    });
    if (error) console.error(`  ERROR adding member ${member.email}:`, error.message);
    else console.log(`  Added member: ${member.email}`);
  }

  // 3. Create a second conversation for isolation testing (outsider only)
  console.log('\nCreating outsider conversation...');
  const { data: outsiderConv, error: outsiderConvErr } = await admin.from('conversations').insert({
    conversation_type: 'direct_inquiry',
    title: 'QA Realtime Outsider Conversation',
    created_by: outsiderUser.id,
  }).select().single();

  if (outsiderConvErr) {
    console.error('ERROR creating outsider conversation:', outsiderConvErr.message);
  } else {
    console.log(`  Outsider conversation: ${outsiderConv.id}`);
    const { error } = await admin.from('conversation_members').insert({
      conversation_id: outsiderConv.id,
      user_id: outsiderUser.id,
      member_role: 'participant',
    });
    if (error) console.error(`  ERROR adding outsider:`, error.message);
  }

  console.log('\n=== SETUP COMPLETE ===');
  console.log('\nCredentials:');
  console.log(`  Client:     ${QA_CLIENT_EMAIL} / ${QA_PASSWORD}`);
  console.log(`  Consultant: ${QA_CONSULTANT_EMAIL} / ${QA_PASSWORD}`);
  console.log(`  Outsider:   ${QA_OUTSIDER_EMAIL} / ${QA_PASSWORD}`);
  console.log(`\n  Main Conversation ID: ${conversation.id}`);
  console.log(`  Outsider Conv ID:    ${outsiderConv?.id || 'FAILED'}`);
  console.log(`\n  Messages URL (Client):     http://localhost:3000/messages/${conversation.id}`);
  console.log(`  Messages URL (Consultant): http://localhost:3000/messages/${conversation.id}`);
}

async function teardown() {
  console.log('=== REALTIME QA TEARDOWN ===\n');

  // Find QA users
  const { data: qaUsers } = await admin.from('users')
    .select('id, email')
    .in('email', QA_EMAILS);

  if (!qaUsers || qaUsers.length === 0) {
    console.log('No QA users found. Already clean.');
    return;
  }

  const qaUserIds = qaUsers.map(u => u.id);
  console.log(`Found ${qaUsers.length} QA users: ${qaUsers.map(u => u.email).join(', ')}`);

  // 1. Delete messages by QA users
  const { error: msgErr, count: msgCount } = await admin.from('messages')
    .delete({ count: 'exact' })
    .in('sender_id', qaUserIds);
  console.log(`  Deleted messages: ${msgCount ?? 0} ${msgErr ? '(ERROR: ' + msgErr.message + ')' : ''}`);

  // 2. Delete conversation members
  const { error: memErr, count: memCount } = await admin.from('conversation_members')
    .delete({ count: 'exact' })
    .in('user_id', qaUserIds);
  console.log(`  Deleted conversation_members: ${memCount ?? 0} ${memErr ? '(ERROR: ' + memErr.message + ')' : ''}`);

  // 3. Delete conversations created by QA users
  const { error: convErr, count: convCount } = await admin.from('conversations')
    .delete({ count: 'exact' })
    .in('created_by', qaUserIds);
  console.log(`  Deleted conversations: ${convCount ?? 0} ${convErr ? '(ERROR: ' + convErr.message + ')' : ''}`);

  // 4. Delete notifications for QA users
  const { error: notErr } = await admin.from('notifications')
    .delete()
    .in('user_id', qaUserIds);
  if (notErr) console.log(`  Notifications delete error: ${notErr.message}`);
  else console.log(`  Deleted notifications`);

  // 5. Delete profiles
  for (const uid of qaUserIds) {
    await admin.from('consultant_profiles').delete().eq('user_id', uid);
    await admin.from('client_profiles').delete().eq('user_id', uid);
    await admin.from('profiles').delete().eq('user_id', uid);
  }
  console.log(`  Deleted profiles`);

  // 6. Delete public.users
  const { error: usrErr } = await admin.from('users').delete().in('id', qaUserIds);
  console.log(`  Deleted public.users ${usrErr ? '(ERROR: ' + usrErr.message + ')' : ''}`);

  // 7. Delete auth.users
  for (const uid of qaUserIds) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) console.error(`  ERROR deleting auth user ${uid}:`, error.message);
    else console.log(`  Deleted auth user: ${uid}`);
  }

  // 8. Verify residue = 0
  console.log('\n--- Residue Check ---');
  const { data: remaining } = await admin.from('users')
    .select('email')
    .in('email', QA_EMAILS);
  console.log(`  public.users QA residue: ${remaining?.length ?? 0}`);

  const { data: authRemaining } = await admin.auth.admin.listUsers();
  const qaAuth = authRemaining?.users?.filter(u => QA_EMAILS.includes(u.email ?? '')) ?? [];
  console.log(`  auth.users QA residue: ${qaAuth.length}`);

  console.log('\n=== TEARDOWN COMPLETE ===');
}

async function verifyPublication() {
  console.log('=== VERIFY REALTIME PUBLICATION ===\n');
  
  // We can't query pg_publication_tables directly through PostgREST,
  // but we can try to subscribe to a test channel to see if it works.
  const { createClient: createAnonClient } = await import('@supabase/supabase-js');
  
  // Credentials come from the environment; an API key was previously
  // hardcoded here and has been removed. Never commit a key in this file.
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const anon = createAnonClient(SUPABASE_URL, anonKey, {
    realtime: { params: { eventsPerSecond: 10 } }
  });

  console.log('Subscribing to messages channel (anonymous)...');
  const channel = anon.channel('test-publication-check')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
    }, (payload) => {
      console.log('  Received event:', payload.eventType);
    })
    .subscribe((status) => {
      console.log(`  Channel status: ${status}`);
      if (status === 'SUBSCRIBED') {
        console.log('  SUCCESS: Channel subscribed. messages is in the publication.');
        setTimeout(() => {
          anon.removeChannel(channel);
          process.exit(0);
        }, 1000);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.log('  FAIL: Channel error or timeout. Publication may be misconfigured.');
        process.exit(1);
      }
    });

  // Timeout after 10 seconds
  setTimeout(() => {
    console.log('  TIMEOUT: No status received within 10 seconds.');
    anon.removeChannel(channel);
    process.exit(1);
  }, 10000);
}

const action = process.argv[2];
if (action === 'setup') {
  setup().catch(e => { console.error(e); process.exit(1); });
} else if (action === 'teardown') {
  teardown().catch(e => { console.error(e); process.exit(1); });
} else if (action === 'verify-publication') {
  verifyPublication().catch(e => { console.error(e); process.exit(1); });
} else {
  console.log('Usage: node scripts/realtime-qa-setup.mjs <setup|teardown|verify-publication>');
  process.exit(1);
}
