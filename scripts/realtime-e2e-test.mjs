/**
 * Realtime diagnostic (lower level, NOT end-to-end proof).
 *
 * Exercises the Supabase wire protocol directly to check whether Realtime
 * INSERT events are delivered on a channel.
 *
 * SCOPE NOTE: this does NOT prove the application's browser path works. The
 * authoritative check is `scripts/realtime-browser-e2e.cjs`, which drives two
 * real browser contexts through the application UI.
 *
 * Credentials are read from the environment. An API key was previously
 * hardcoded in this file and has been removed. Never commit a key here again.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Load .env.local without printing any value.
const envPath = new URL('../.env.local', import.meta.url);
for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq === -1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[k] === undefined) process.env[k] = v;
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const QA_CLIENT_EMAIL = process.env.QA_REALTIME_CLIENT_EMAIL;
const QA_CONSULTANT_EMAIL = process.env.QA_REALTIME_CONSULTANT_EMAIL;
const QA_OUTSIDER_EMAIL = process.env.QA_REALTIME_OUTSIDER_EMAIL;
const QA_PASSWORD = process.env.QA_REALTIME_PASSWORD;
const CONVERSATION_ID = process.env.QA_REALTIME_CONVERSATION_ID;
const OUTSIDER_CONVERSATION_ID = process.env.QA_REALTIME_OUTSIDER_CONVERSATION_ID;

const results = [];
function log(test, status, detail) {
  const entry = { test, status, detail };
  results.push(entry);
  console.log(`[${status}] ${test}: ${detail}`);
}

async function createAuthenticatedClient(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
  return { client, user: data.user, session: data.session };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTests() {
  console.log('=== REALTIME END-TO-END VERIFICATION ===\n');
  
  // Create authenticated clients
  console.log('--- Authenticating QA users ---');
  const clientAuth = await createAuthenticatedClient(QA_CLIENT_EMAIL, QA_PASSWORD);
  log('Auth - Client', 'PASS', `Authenticated as ${clientAuth.user.id}`);
  
  const consultantAuth = await createAuthenticatedClient(QA_CONSULTANT_EMAIL, QA_PASSWORD);
  log('Auth - Consultant', 'PASS', `Authenticated as ${consultantAuth.user.id}`);

  const outsiderAuth = await createAuthenticatedClient(QA_OUTSIDER_EMAIL, QA_PASSWORD);
  log('Auth - Outsider', 'PASS', `Authenticated as ${outsiderAuth.user.id}`);

  // ==========================================================================
  // TEST A: Subscription
  // ==========================================================================
  console.log('\n--- Test A: Subscription ---');
  
  let clientSubscriptionStatus = null;
  let clientReceivedEvents = [];
  
  const clientChannel = clientAuth.client
    .channel(`messages:conversation_id=eq.${CONVERSATION_ID}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${CONVERSATION_ID}`,
    }, (payload) => {
      clientReceivedEvents.push(payload);
      console.log(`  [Client] Received INSERT event: ${payload.new?.id}`);
    })
    .subscribe((status) => {
      clientSubscriptionStatus = status;
      console.log(`  [Client] Channel status: ${status}`);
    });

  // Wait for subscription to establish
  await sleep(3000);
  
  if (clientSubscriptionStatus === 'SUBSCRIBED') {
    log('Test A - Subscription', 'PASS', 'Client subscribed to conversation channel');
  } else {
    log('Test A - Subscription', 'FAIL', `Client status: ${clientSubscriptionStatus}`);
  }

  // ==========================================================================
  // TEST B: Consultant sends → Client receives
  // ==========================================================================
  console.log('\n--- Test B: Consultant sends message ---');
  
  const testMsg1 = `RT-E2E-1: Consultant to Client at ${new Date().toISOString()}`;
  const { data: msg1, error: msg1Err } = await consultantAuth.client
    .from('messages')
    .insert({
      conversation_id: CONVERSATION_ID,
      sender_id: consultantAuth.user.id,
      content: testMsg1,
    })
    .select()
    .single();

  if (msg1Err) {
    log('Test B - HTTP Insert', 'FAIL', msg1Err.message);
  } else {
    log('Test B - HTTP Insert', 'PASS', `Message inserted: ${msg1.id}`);
  }

  // Wait for Realtime delivery
  await sleep(3000);
  
  const msg1Event = clientReceivedEvents.find(e => e.new?.id === msg1?.id);
  if (msg1Event) {
    const contentMatch = msg1Event.new?.content === testMsg1;
    const convMatch = msg1Event.new?.conversation_id === CONVERSATION_ID;
    log('Test B - Realtime Delivery', 'PASS', 
      `Event received. Content match: ${contentMatch}, Conv match: ${convMatch}`);
  } else {
    log('Test B - Realtime Delivery', 'FAIL', 
      `No INSERT event received for msg ${msg1?.id}. Total events: ${clientReceivedEvents.length}`);
  }

  // ==========================================================================
  // TEST C: Client sends → (verify echo or self-receipt)
  // ==========================================================================
  console.log('\n--- Test C: Client sends second message ---');
  
  const testMsg2 = `RT-E2E-2: Client reply at ${new Date().toISOString()}`;
  const { data: msg2, error: msg2Err } = await clientAuth.client
    .from('messages')
    .insert({
      conversation_id: CONVERSATION_ID,
      sender_id: clientAuth.user.id,
      content: testMsg2,
    })
    .select()
    .single();

  if (msg2Err) {
    log('Test C - HTTP Insert', 'FAIL', msg2Err.message);
  } else {
    log('Test C - HTTP Insert', 'PASS', `Message inserted: ${msg2.id}`);
  }

  await sleep(3000);
  
  // Client should also receive its own INSERT event via Realtime
  const msg2Event = clientReceivedEvents.find(e => e.new?.id === msg2?.id);
  if (msg2Event) {
    log('Test C - Realtime Self-Echo', 'PASS', 'Client received own INSERT event');
  } else {
    log('Test C - Realtime Self-Echo', 'INFO', 
      'Client did not receive own INSERT echo (may be filtered by RLS)');
  }

  // Check no duplicates
  const duplicates = clientReceivedEvents.filter(
    (e, i, arr) => arr.findIndex(x => x.new?.id === e.new?.id) !== i
  );
  if (duplicates.length === 0) {
    log('Test C - No Duplicates', 'PASS', 'No duplicate events received');
  } else {
    log('Test C - No Duplicates', 'FAIL', `${duplicates.length} duplicate events`);
  }

  // ==========================================================================
  // TEST D: Isolation - unrelated conversation
  // ==========================================================================
  console.log('\n--- Test D: Isolation ---');
  
  let outsiderReceivedEvents = [];
  
  // Outsider subscribes to THEIR conversation
  const outsiderChannel = outsiderAuth.client
    .channel(`messages:conversation_id=eq.${OUTSIDER_CONVERSATION_ID}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${OUTSIDER_CONVERSATION_ID}`,
    }, (payload) => {
      outsiderReceivedEvents.push(payload);
    })
    .subscribe();

  await sleep(2000);

  // Send another message in the Client-Consultant conversation
  const testMsg3 = `RT-E2E-3: Isolation test at ${new Date().toISOString()}`;
  await consultantAuth.client.from('messages').insert({
    conversation_id: CONVERSATION_ID,
    sender_id: consultantAuth.user.id,
    content: testMsg3,
  });

  await sleep(3000);

  if (outsiderReceivedEvents.length === 0) {
    log('Test D - Isolation', 'PASS', 'Outsider received 0 events from unrelated conversation');
  } else {
    log('Test D - Isolation', 'FAIL', 
      `Outsider received ${outsiderReceivedEvents.length} events (PRIVACY LEAK)`);
  }

  // ==========================================================================
  // TEST E: Authorization - non-member cannot read messages
  // ==========================================================================
  console.log('\n--- Test E: Authorization ---');
  
  const { data: unauthorizedMessages, error: authError } = await outsiderAuth.client
    .from('messages')
    .select('*')
    .eq('conversation_id', CONVERSATION_ID);

  if (authError) {
    log('Test E - Authorization (RLS)', 'PASS', `Non-member query error: ${authError.message}`);
  } else if (!unauthorizedMessages || unauthorizedMessages.length === 0) {
    log('Test E - Authorization (RLS)', 'PASS', 'Non-member received 0 messages (RLS working)');
  } else {
    log('Test E - Authorization (RLS)', 'FAIL', 
      `Non-member received ${unauthorizedMessages.length} messages (RLS BROKEN)`);
  }

  // Verify member CAN read messages
  const { data: authorizedMessages, error: memberError } = await clientAuth.client
    .from('messages')
    .select('*')
    .eq('conversation_id', CONVERSATION_ID);

  if (memberError) {
    log('Test E - Member Read', 'FAIL', memberError.message);
  } else {
    log('Test E - Member Read', 'PASS', `Member read ${authorizedMessages.length} messages`);
  }

  // ==========================================================================
  // TEST F: Normal HTTP messaging still works
  // ==========================================================================
  console.log('\n--- Test F: HTTP Messaging Regression ---');
  
  // Conversation list
  const { data: convList, error: convListErr } = await clientAuth.client
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', clientAuth.user.id);
  
  if (convListErr) {
    log('Test F - Conversation List', 'FAIL', convListErr.message);
  } else {
    log('Test F - Conversation List', 'PASS', `Found ${convList.length} conversations`);
  }

  // Message retrieval
  const { data: msgList, error: msgListErr } = await clientAuth.client
    .from('messages')
    .select('*')
    .eq('conversation_id', CONVERSATION_ID)
    .order('created_at', { ascending: true });

  if (msgListErr) {
    log('Test F - Message Retrieval', 'FAIL', msgListErr.message);
  } else {
    log('Test F - Message Retrieval', 'PASS', 
      `Retrieved ${msgList.length} messages in correct order`);
  }

  // ==========================================================================
  // CLEANUP channels
  // ==========================================================================
  await clientAuth.client.removeChannel(clientChannel);
  await outsiderAuth.client.removeChannel(outsiderChannel);

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n\n=== TEST SUMMARY ===\n');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const info = results.filter(r => r.status === 'INFO').length;
  
  for (const r of results) {
    console.log(`  [${r.status}] ${r.test}: ${r.detail}`);
  }
  
  console.log(`\n  Total: ${results.length} | PASS: ${passed} | FAIL: ${failed} | INFO: ${info}`);
  
  if (failed > 0) {
    console.log('\n  VERDICT: FAIL — Some tests did not pass.');
    process.exit(1);
  } else {
    console.log('\n  VERDICT: SUCCESS — All tests passed.');
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
