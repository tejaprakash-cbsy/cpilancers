import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createDiscussionSchema,
  createReplySchema,
} from '../src/lib/validations/forum.schemas';
import {
  LEGACY_CATEGORY_SLUGS,
  SEED_CATEGORIES,
  SEED_DISCUSSIONS,
  SEED_EMAIL_DOMAIN,
  SEED_PERSONAS,
} from './data/sap-cpi-forum-seed';

function loadEnvironment(): string | null {
  const cwd = process.cwd();
  const envLocal = path.join(cwd, '.env.local');
  const envDefault = path.join(cwd, '.env');

  if (fs.existsSync(envLocal)) {
    loadEnv({ path: envLocal });
    return '.env.local';
  }
  if (fs.existsSync(envDefault)) {
    loadEnv({ path: envDefault });
    return '.env';
  }
  return null;
}

function createAdminSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secretKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY in environment.'
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function printUsage() {
  console.log(`
CPI Lancers Forum Seed Script
=============================
Usage:
  npx tsx scripts/seed-forum.ts --dry-run
      Validate all personas, categories, 25 discussions, replies, and votes locally (zero DB calls).

  npx tsx scripts/seed-forum.ts --confirm-seed
      Idempotently seed 10 non-hireable @seed.cpilancers.com personas, 5 SAP Integration
      categories, 25 discussions, replies, accepted answers, and votes.

  npx tsx scripts/seed-forum.ts --cleanup --confirm-cleanup
      Safely delete ONLY votes, posts, discussions, profiles, public.users, and auth.users
      belonging to ${SEED_EMAIL_DOMAIN} accounts.
`);
}

function validateSeedDataset() {
  const errors: string[] = [];
  const personaEmails = new Set<string>();
  const categorySlugs = new Set<string>();
  const discussionKeys = new Set<string>();
  const dummyCategoryUuid = '00000000-0000-4000-8000-000000000001';

  for (const p of SEED_PERSONAS) {
    if (!p.email.endsWith(SEED_EMAIL_DOMAIN)) {
      errors.push(`Persona email must end with ${SEED_EMAIL_DOMAIN}: ${p.email}`);
    }
    if (personaEmails.has(p.email)) {
      errors.push(`Duplicate persona email: ${p.email}`);
    }
    personaEmails.add(p.email);
  }

  for (const c of SEED_CATEGORIES) {
    if (categorySlugs.has(c.slug)) {
      errors.push(`Duplicate category slug: ${c.slug}`);
    }
    categorySlugs.add(c.slug);
  }

  let totalReplies = 0;
  let totalDiscussionVotes = 0;
  let totalReplyVotes = 0;
  let acceptedCount = 0;

  for (const d of SEED_DISCUSSIONS) {
    if (discussionKeys.has(d.key)) {
      errors.push(`Duplicate discussion key: ${d.key}`);
    }
    discussionKeys.add(d.key);

    if (!categorySlugs.has(d.categorySlug)) {
      errors.push(`Discussion ${d.key} references unknown category ${d.categorySlug}`);
    }
    if (!personaEmails.has(d.authorEmail)) {
      errors.push(`Discussion ${d.key} references unknown author ${d.authorEmail}`);
    }

    const discValidation = createDiscussionSchema.safeParse({
      categoryId: dummyCategoryUuid,
      title: d.title,
      body: d.body,
    });
    if (!discValidation.success) {
      errors.push(
        `Discussion ${d.key} failed Zod validation: ${discValidation.error.issues
          .map((i) => i.message)
          .join('; ')}`
      );
    }

    if (/\*\*|###|```/.test(d.title) || /\*\*|###|```/.test(d.body)) {
      errors.push(`Discussion ${d.key} contains forbidden Markdown tokens (**, ###, or \`\`\`)`);
    }

    totalDiscussionVotes += new Set(d.voterEmails).size;
    for (const v of d.voterEmails) {
      if (!personaEmails.has(v)) {
        errors.push(`Discussion ${d.key} has unknown voter ${v}`);
      }
    }

    let threadAccepted = 0;
    for (const [idx, r] of d.replies.entries()) {
      totalReplies += 1;
      if (!personaEmails.has(r.authorEmail)) {
        errors.push(`Reply ${d.key}#${idx} references unknown author ${r.authorEmail}`);
      }
      if (r.authorEmail === d.authorEmail) {
        errors.push(`Reply ${d.key}#${idx} has same author as thread author (${r.authorEmail})`);
      }

      const replyValidation = createReplySchema.safeParse({ body: r.body });
      if (!replyValidation.success) {
        errors.push(
          `Reply ${d.key}#${idx} failed Zod validation: ${replyValidation.error.issues
            .map((i) => i.message)
            .join('; ')}`
        );
      }

      if (/\*\*|###|```/.test(r.body)) {
        errors.push(`Reply ${d.key}#${idx} contains forbidden Markdown tokens (**, ###, or \`\`\`)`);
      }

      if (r.isAccepted) {
        threadAccepted += 1;
        acceptedCount += 1;
      }

      totalReplyVotes += new Set(r.voterEmails).size;
      for (const v of r.voterEmails) {
        if (!personaEmails.has(v)) {
          errors.push(`Reply ${d.key}#${idx} has unknown voter ${v}`);
        }
      }
    }

    if (threadAccepted > 1) {
      errors.push(`Discussion ${d.key} has more than one accepted reply`);
    }
  }

  return {
    errors,
    stats: {
      personas: SEED_PERSONAS.length,
      categories: SEED_CATEGORIES.length,
      discussions: SEED_DISCUSSIONS.length,
      replies: totalReplies,
      discussionVotes: totalDiscussionVotes,
      replyVotes: totalReplyVotes,
      acceptedAnswers: acceptedCount,
    },
  };
}

function runDryRun() {
  const { errors, stats } = validateSeedDataset();

  console.log('\n=== CPI Lancers Forum Seed — Dry Run Validation ===');
  console.table([
    { Metric: 'Seed Personas (@seed.cpilancers.com)', Count: stats.personas },
    { Metric: 'SAP Integration Categories', Count: stats.categories },
    { Metric: 'Technical Discussions', Count: stats.discussions },
    { Metric: 'Replies', Count: stats.replies },
    { Metric: 'Accepted Answers', Count: stats.acceptedAnswers },
    { Metric: 'Discussion Votes', Count: stats.discussionVotes },
    { Metric: 'Reply Votes', Count: stats.replyVotes },
  ]);

  console.log('\nThreads per category:');
  const byCategory = SEED_CATEGORIES.map((cat) => ({
    Slug: cat.slug,
    Category: cat.name,
    Threads: SEED_DISCUSSIONS.filter((d) => d.categorySlug === cat.slug).length,
  }));
  console.table(byCategory);

  if (errors.length > 0) {
    console.error('\nValidation Errors:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('\nValidation passed: all Zod schemas, plain-text checks, and constraints are valid (0 DB calls made).');
}

async function ensureSeedPersona(
  supabase: SupabaseClient,
  persona: (typeof SEED_PERSONAS)[number],
  authUserMap: Map<string, string>
): Promise<string> {
  let userId = authUserMap.get(persona.email.toLowerCase());

  if (!userId) {
    const { data: existingPublicUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', persona.email.toLowerCase())
      .maybeSingle();

    if (existingPublicUser?.id) {
      userId = existingPublicUser.id as string;
    }
  }

  if (!userId) {
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: persona.email,
      password: randomPassword,
      email_confirm: true,
      user_metadata: {
        first_name: persona.firstName,
        last_name: persona.lastName,
        display_name: persona.displayName,
      },
    });

    if (createError || !created.user) {
      throw new Error(
        `Failed to create auth user for ${persona.email}: ${createError?.message || 'unknown error'}`
      );
    }
    userId = created.user.id;
    authUserMap.set(persona.email.toLowerCase(), userId);
  }

  const { error: userUpsertErr } = await supabase.from('users').upsert(
    {
      id: userId,
      email: persona.email.toLowerCase(),
      role: 'consultant',
      status: 'active',
      is_email_verified: true,
    },
    { onConflict: 'id' }
  );

  if (userUpsertErr) {
    throw new Error(`Failed to upsert public.users for ${persona.email}: ${userUpsertErr.message}`);
  }

  const { error: profileUpsertErr } = await supabase.from('profiles').upsert(
    {
      user_id: userId,
      first_name: persona.firstName,
      last_name: persona.lastName,
      display_name: persona.displayName,
      timezone: 'Asia/Kolkata',
      country_code: 'IN',
    },
    { onConflict: 'user_id' }
  );

  if (profileUpsertErr) {
    throw new Error(
      `Failed to upsert public.profiles for ${persona.email}: ${profileUpsertErr.message}`
    );
  }

  return userId;
}

async function runSeed(supabase: SupabaseClient) {
  const { errors } = validateSeedDataset();
  if (errors.length > 0) {
    throw new Error(`Dataset validation failed:\n${errors.join('\n')}`);
  }

  console.log('1. Loading existing auth users...');
  const authUserMap = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Failed to list auth users: ${error.message}`);
    for (const u of data.users) {
      if (u.email) authUserMap.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < 200) break;
    page += 1;
  }

  console.log('2. Ensuring 10 non-hireable seed personas...');
  const personaIdByEmail = new Map<string, string>();
  for (const persona of SEED_PERSONAS) {
    const id = await ensureSeedPersona(supabase, persona, authUserMap);
    personaIdByEmail.set(persona.email, id);
  }

  console.log('3. Upserting 5 SAP Integration categories...');
  const categoryIdBySlug = new Map<string, string>();
  for (const cat of SEED_CATEGORIES) {
    const { data, error } = await supabase
      .from('forum_categories')
      .upsert(
        {
          slug: cat.slug,
          name: cat.name,
          description: cat.description,
          sort_order: cat.sortOrder,
        },
        { onConflict: 'slug' }
      )
      .select('id, slug')
      .single();

    if (error || !data) {
      throw new Error(`Failed to upsert category ${cat.slug}: ${error?.message}`);
    }
    categoryIdBySlug.set(cat.slug, data.id as string);
  }

  console.log('4. Cleaning up unreferenced legacy default categories...');
  for (const legacySlug of LEGACY_CATEGORY_SLUGS) {
    const { data: legacyCat } = await supabase
      .from('forum_categories')
      .select('id')
      .eq('slug', legacySlug)
      .maybeSingle();

    if (!legacyCat?.id) continue;

    const { count } = await supabase
      .from('forum_discussions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', legacyCat.id);

    if ((count ?? 0) === 0) {
      await supabase.from('forum_categories').delete().eq('id', legacyCat.id);
      console.log(`   - Deleted unused legacy category: ${legacySlug}`);
    } else {
      console.log(`   - Kept legacy category ${legacySlug} (${count} existing discussions)`);
    }
  }

  console.log('5. Seeding 25 discussions, replies, accepted answers, and votes...');
  const nowMs = Date.now();
  let createdDiscussions = 0;
  let createdReplies = 0;

  for (const d of SEED_DISCUSSIONS) {
    const categoryId = categoryIdBySlug.get(d.categorySlug)!;
    const authorId = personaIdByEmail.get(d.authorEmail)!;
    const threadCreatedAt = new Date(nowMs - d.daysAgo * 86_400_000);

    const { data: existingDisc } = await supabase
      .from('forum_discussions')
      .select('id')
      .eq('author_id', authorId)
      .eq('title', d.title)
      .maybeSingle();

    let discussionId = existingDisc?.id as string | undefined;

    if (!discussionId) {
      const { data: insertedDisc, error: discErr } = await supabase
        .from('forum_discussions')
        .insert({
          category_id: categoryId,
          author_id: authorId,
          title: d.title,
          body: d.body,
          status: 'open',
          is_pinned: Boolean(d.isPinned),
          view_count: d.viewCount,
          created_at: threadCreatedAt.toISOString(),
          updated_at: threadCreatedAt.toISOString(),
          last_activity_at: threadCreatedAt.toISOString(),
        })
        .select('id')
        .single();

      if (discErr || !insertedDisc) {
        throw new Error(`Failed to insert discussion "${d.title}": ${discErr?.message}`);
      }
      discussionId = insertedDisc.id as string;
      createdDiscussions += 1;
    }

    let acceptedPostId: string | null = null;
    let latestActivityMs = threadCreatedAt.getTime();

    for (const reply of d.replies) {
      const replyAuthorId = personaIdByEmail.get(reply.authorEmail)!;
      const replyCreatedAt = new Date(
        threadCreatedAt.getTime() + reply.hoursAfterThread * 3_600_000
      );
      if (replyCreatedAt.getTime() > latestActivityMs) {
        latestActivityMs = replyCreatedAt.getTime();
      }

      const { data: existingPost } = await supabase
        .from('forum_posts')
        .select('id')
        .eq('discussion_id', discussionId)
        .eq('author_id', replyAuthorId)
        .eq('body', reply.body)
        .maybeSingle();

      let postId = existingPost?.id as string | undefined;

      if (!postId) {
        const { data: insertedPost, error: postErr } = await supabase
          .from('forum_posts')
          .insert({
            discussion_id: discussionId,
            author_id: replyAuthorId,
            body: reply.body,
            status: 'active',
            created_at: replyCreatedAt.toISOString(),
            updated_at: replyCreatedAt.toISOString(),
          })
          .select('id')
          .single();

        if (postErr || !insertedPost) {
          throw new Error(`Failed to insert reply on "${d.title}": ${postErr?.message}`);
        }
        postId = insertedPost.id as string;
        createdReplies += 1;
      }

      if (reply.isAccepted) {
        acceptedPostId = postId;
      }

      const uniquePostVoters = [...new Set(reply.voterEmails)];
      for (const voterEmail of uniquePostVoters) {
        const voterId = personaIdByEmail.get(voterEmail)!;
        await supabase.from('forum_votes').upsert(
          {
            user_id: voterId,
            post_id: postId,
            discussion_id: null,
          },
          { onConflict: 'user_id,post_id' }
        );
      }

      const { count: postVoteCount } = await supabase
        .from('forum_votes')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', postId);

      await supabase
        .from('forum_posts')
        .update({ upvote_count: postVoteCount ?? 0 })
        .eq('id', postId);
    }

    const uniqueDiscVoters = [...new Set(d.voterEmails)];
    for (const voterEmail of uniqueDiscVoters) {
      const voterId = personaIdByEmail.get(voterEmail)!;
      await supabase.from('forum_votes').upsert(
        {
          user_id: voterId,
          discussion_id: discussionId,
          post_id: null,
        },
        { onConflict: 'user_id,discussion_id' }
      );
    }

    const [{ count: replyCount }, { count: discVoteCount }] = await Promise.all([
      supabase
        .from('forum_posts')
        .select('id', { count: 'exact', head: true })
        .eq('discussion_id', discussionId)
        .eq('status', 'active'),
      supabase
        .from('forum_votes')
        .select('id', { count: 'exact', head: true })
        .eq('discussion_id', discussionId),
    ]);

    await supabase
      .from('forum_discussions')
      .update({
        reply_count: replyCount ?? 0,
        upvote_count: discVoteCount ?? 0,
        last_activity_at: new Date(latestActivityMs).toISOString(),
        accepted_post_id: acceptedPostId,
      })
      .eq('id', discussionId);
  }

  console.log(
    `\nSeed complete: ${createdDiscussions} new discussions created, ${createdReplies} new replies created (idempotent).`
  );
}

async function runCleanup(supabase: SupabaseClient) {
  console.log(`1. Finding seed users matching *${SEED_EMAIL_DOMAIN}...`);
  const { data: seedUsers, error: fetchErr } = await supabase
    .from('users')
    .select('id, email')
    .ilike('email', `%${SEED_EMAIL_DOMAIN}`);

  if (fetchErr) {
    throw new Error(`Failed to query seed users: ${fetchErr.message}`);
  }

  const seedUserIds = (seedUsers || []).map((u) => u.id as string);
  if (seedUserIds.length === 0) {
    console.log('No seed users found. Nothing to clean up.');
    return;
  }

  console.log(`2. Deleting forum votes, posts, discussions, profiles, and users for ${seedUserIds.length} seed accounts...`);

  const { data: seedDiscussions } = await supabase
    .from('forum_discussions')
    .select('id')
    .in('author_id', seedUserIds);
  const seedDiscussionIds = (seedDiscussions || []).map((d) => d.id as string);

  await supabase.from('forum_votes').delete().in('user_id', seedUserIds);
  if (seedDiscussionIds.length > 0) {
    await supabase.from('forum_votes').delete().in('discussion_id', seedDiscussionIds);
    await supabase.from('forum_posts').delete().in('discussion_id', seedDiscussionIds);
  }
  await supabase.from('forum_posts').delete().in('author_id', seedUserIds);
  await supabase.from('forum_discussions').delete().in('author_id', seedUserIds);
  await supabase.from('profiles').delete().in('user_id', seedUserIds);
  await supabase.from('users').delete().in('id', seedUserIds);

  for (const id of seedUserIds) {
    await supabase.auth.admin.deleteUser(id);
  }

  console.log(`Cleanup complete: removed ${seedUserIds.length} seed users and their forum content.`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const isDryRun = args.has('--dry-run');
  const isConfirmSeed = args.has('--confirm-seed');
  const isCleanup = args.has('--cleanup') && args.has('--confirm-cleanup');

  if (isDryRun) {
    runDryRun();
    return;
  }

  if (!isConfirmSeed && !isCleanup) {
    printUsage();
    process.exit(1);
  }

  const envFile = loadEnvironment();
  console.log(`Loaded environment from: ${envFile ?? 'process.env'}`);
  const supabase = createAdminSupabase();

  if (isCleanup) {
    await runCleanup(supabase);
    return;
  }

  if (isConfirmSeed) {
    await runSeed(supabase);
  }
}

main().catch((err) => {
  console.error('[seed-forum] Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
