import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

/**
 * QA fixture setup for the Realtime browser end-to-end test.
 *
 * Creates a client, a consultant and an outsider, plus the QA conversation the
 * client and consultant share.
 *
 * Normally users are created through POST /api/auth/register, but the project
 * has hit Supabase's email rate limit (HTTP 429 on /auth/v1/signup), which is an
 * infrastructure limit rather than application behaviour. So the auth user is
 * created via the Admin API and then we write EXACTLY the rows
 * `auth.service.ts registerUser()` writes:
 *   public.users    {id, email, role, status, is_email_verified}
 *   public.profiles {user_id, first_name, last_name, display_name, tz, country}
 * The public.users row is the part that matters: without it /api/auth/me cannot
 * resolve the session, which was the earlier false-positive.
 */
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const raw of fs.readFileSync(path.join(APP, '.env.local'), 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq === -1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[k] === undefined) process.env[k] = v;
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

const PW = process.env.QA_RT_PASSWORD;
const TAG = 'rt-e2e';
const U = {
  client: TAG + '-client@test.lancers.dev',
  consultant: TAG + '-consultant@test.lancers.dev',
  outsider: TAG + '-outsider@test.lancers.dev',
};

async function main() {
  if (!PW) { console.log('QA_RT_PASSWORD not set'); process.exit(1); }

  // --- create users ---------------------------------------------------------
  // Normally this goes through POST /api/auth/register. That path is currently
  // unusable for QA because the project has hit Supabase's email rate limit
  // (HTTP 429 on /auth/v1/signup), which is an infrastructure limit rather than
  // application behaviour. So we create the auth user via the Admin API and
  // then write EXACTLY the rows `auth.service.ts registerUser()` writes:
  //   public.users    {id, email, role, status, is_email_verified}
  //   public.profiles {user_id, first_name, last_name, display_name, tz, country}
  // The public.users row is the part that matters: without it /api/auth/me
  // cannot resolve the session, which is the earlier false-positive.
  const ids = {};
  for (const [key, email] of Object.entries(U)) {
    // The outsider is registered as a second client: it only needs to be a
    // valid non-member of the conversation. `user_role` has no 'outsider'
    // value, and inventing one is not appropriate.
    const role = key === 'outsider' ? 'client' : key;
    const first = 'QA';
    const last = key === 'outsider' ? 'Outsider' : role.charAt(0).toUpperCase() + role.slice(1);
    const created = await admin.auth.admin.createUser({
      email,
      password: PW,
      email_confirm: true,
      user_metadata: { role, first_name: first, last_name: last },
    });
    if (created.error) { console.log('createUser ' + role + ' FAILED ' + created.error.message); process.exit(1); }
    const id = created.data.user.id;
    // Key by `key`, not by `role`: the outsider is provisioned with the
    // 'client' role, and keying by role made it overwrite the real client's
    // id, which silently dropped the client from the conversation members.
    ids[key] = id;

    const u = await admin.from('users').insert({
      id, email: email.toLowerCase(), role, status: 'active', is_email_verified: false,
    });
    if (u.error) { console.log('users insert ' + role + ' FAILED ' + u.error.message); process.exit(1); }

    const p = await admin.from('profiles').insert({
      user_id: id, first_name: first, last_name: last,
      display_name: first + ' ' + last, timezone: 'UTC', country_code: 'US',
    });
    if (p.error) console.log('  (profiles insert warning for ' + role + ': ' + p.error.message + ')');

    console.log('created ' + key + ' -> users.id ' + id);
  }

  // --- conversation between client and consultant ------------------------
  const origin = process.env.QA_ORIGIN || 'http://localhost:3000';
  const c1 = await admin.from('conversations')
    .insert({ created_by: ids.client })
    .select().single();
  if (c1.error) { console.log('conversation insert failed: ' + c1.error.message); process.exit(1); }
  const conversationId = c1.data.id;
  await admin.from('conversation_members').insert([
    { conversation_id: conversationId, user_id: ids.client },
    { conversation_id: conversationId, user_id: ids.consultant },
  ]);
  console.log('conversation ' + conversationId);

  const out = path.join(APP, 'scripts', '.rt-fixtures.json');
  fs.writeFileSync(out, JSON.stringify({
    origin, password: PW, conversationId,
    emails: U, userIds: ids,
  }, null, 2));
  console.log('fixtures written');
}

main().catch((e) => { console.log('ERROR ' + e.message); process.exit(1); });