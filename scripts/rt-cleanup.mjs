import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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
const TAG = 'rt-e2e-';

async function allAuthUsers() {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.log('listUsers error: ' + error.message); break; }
    out.push(...(data.users || []));
    if (!data.users || data.users.length < 200) break;
  }
  return out;
}

(async () => {
  const removed = { auth: 0, users: 0, profiles: 0, conversations: 0, messages: 0, members: 0, jobs: 0, proposals: 0 };

  // 1. auth users carrying the QA tag
  for (const u of await allAuthUsers()) {
    if ((u.email || '').includes(TAG)) {
      const r = await admin.auth.admin.deleteUser(u.id);
      if (r.error) console.log('  auth delete warn ' + u.email + ': ' + r.error.message);
      else removed.auth++;
    }
  }

  // 2. public.users rows carrying the QA tag -> the ids we own
  const { data: qaUsers } = await admin.from('users').select('id, email').like('email', '%' + TAG + '%');
  const qaIds = new Set((qaUsers || []).map((u) => u.id));

  // 3. conversations whose EVERY member is a QA user (never touches real data)
  const { data: convs } = await admin.from('conversations').select('id');
  for (const c of convs || []) {
    const { data: mem } = await admin.from('conversation_members').select('user_id').eq('conversation_id', c.id);
    const members = (mem || []).map((m) => m.user_id);
    if (members.length > 0 && members.every((id) => qaIds.has(id))) {
      const d1 = await admin.from('messages').delete().eq('conversation_id', c.id);
      if (!d1.error) removed.messages += (d1.count || 0);
      const d2 = await admin.from('conversation_members').delete().eq('conversation_id', c.id);
      if (!d2.error) removed.members += (d2.count || 0);
      const d3 = await admin.from('conversations').delete().eq('id', c.id);
      if (!d3.error) removed.conversations++;
    }
  }

  // 4. profile rows and role rows for QA users
  if (qaIds.size) {
    const p = await admin.from('profiles').delete().in('user_id', [...qaIds]);
    if (!p.error) removed.profiles += (p.count || 0);
    await admin.from('client_profiles').delete().in('user_id', [...qaIds]);
    await admin.from('consultant_profiles').delete().in('user_id', [...qaIds]);
    const j = await admin.from('jobs').delete().in('client_id', [...qaIds]);
    if (!j.error) removed.jobs += (j.count || 0);
    const pr = await admin.from('proposals').delete().in('consultant_id', [...qaIds]);
    if (!pr.error) removed.proposals += (pr.count || 0);
    const u = await admin.from('users').delete().in('id', [...qaIds]);
    if (!u.error) removed.users += (u.count || 0);
  }

  console.log('cleanup removed: ' + JSON.stringify(removed));

  // 5. verify residue
  const r1 = await admin.from('users').select('id', { count: 'exact', head: true }).like('email', '%' + TAG + '%');
  const authLeft = (await allAuthUsers()).filter((u) => (u.email || '').includes(TAG)).length;
  let convLeft = 0;
  const { data: allConv } = await admin.from('conversations').select('id');
  for (const c of allConv || []) {
    const { data: mem } = await admin.from('conversation_members').select('user_id').eq('conversation_id', c.id);
    const members = (mem || []).map((m) => m.user_id);
    if (members.length > 0 && members.every((id) => qaIds.has(id))) convLeft++;
  }
  console.log('RESIDUE users=' + (r1.count || 0) + ' authUsers=' + authLeft + ' qaConversations=' + convLeft);
  try { fs.unlinkSync(path.join(APP, 'scripts', '.rt-fixtures.json')); } catch {}
})().catch((e) => { console.log('ERROR ' + e.message); process.exit(1); });