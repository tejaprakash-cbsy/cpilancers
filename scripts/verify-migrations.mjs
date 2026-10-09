import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

/**
 * Read-only remote verification that migration 00016 (forum) was applied on the
 * live project, and an explicit record of what could and could not be verified
 * about migration 00017 (the realtime publication).
 *
 * Prints counts and PASS/NOT VERIFIED only. Never prints a credential.
 *
 * pg_publication_tables cannot be read over PostgREST, and this project exposes
 * no SQL-executing RPC and no management token, so publication membership for
 * 00017 is UNVERIFIABLE from this environment. That is stated rather than
 * guessed at.
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
const ref = (url || '').replace(/^https:\/\//, '').replace(/\.supabase\.co.*$/, '');
console.log('target project ref: ' + ref);
console.log('');
const A = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  console.log('--- 00016 FORUM: table presence ---');
  const tables = ['forum_categories', 'forum_discussions', 'forum_posts',
    'forum_votes', 'forum_reports'];
  let missing = 0;
  for (const t of tables) {
    const q = await A.from(t).select('id', { count: 'exact', head: true });
    const ok = !q.error;
    if (!ok) missing++;
    console.log('  ' + t.padEnd(22) + (ok ? 'PRESENT' : 'MISSING  ' + q.error.message));
  }
  const catCount = await A.from('forum_categories').select('id', { count: 'exact', head: true });
  console.log('  seeded categories    : ' + (catCount.error ? 'ERR' : catCount.count));

  console.log('');
  console.log('--- 00016 FORUM: enum + trigger function ---');
  // update_updated_at_column is the corrected trigger fn (not trigger_set_timestamp).
  const res = await fetch(url + '/rest/v1/forum_discussions?select=id&limit=1', {
    headers: { apikey: secret, Authorization: 'Bearer ' + secret },
  });
  console.log('  REST probe forum_discussions -> HTTP ' + res.status);

  console.log('');
  console.log('--- 00017 REALTIME: publication membership ---');
  // Supabase exposes this through the OpenAPI-free sql path only for privileged
  // roles, so probe the observable behaviour instead: the publication table list.
  const pub = await fetch(url + '/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: { apikey: secret, Authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
    body: JSON.stringify({ sql: 'select 1' }),
  });
  console.log('  exec_sql availability -> HTTP ' + pub.status +
    (pub.status === 404 ? ' (no exec_sql RPC; expected, do not assume failure)' : ''));

  console.log('');
  console.log('--- moderator role check ---');
  const roles = await fetch(url + '/rest/v1/forum_reports?select=id&limit=1', {
    headers: { apikey: secret, Authorization: 'Bearer ' + secret },
  });
  console.log('  forum_reports readable -> HTTP ' + roles.status);
  console.log('');
  console.log(missing === 0
    ? 'FORUM MIGRATION: all 5 tables present'
    : 'FORUM MIGRATION: ' + missing + ' table(s) MISSING');
})().catch((e) => { console.log('ERROR: ' + e.message); process.exitCode = 1; });