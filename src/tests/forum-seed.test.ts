import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDiscussionSchema,
  createReplySchema,
} from '@/lib/validations/forum.schemas';
import {
  LEGACY_CATEGORY_SLUGS,
  SEED_CATEGORIES,
  SEED_DISCUSSIONS,
  SEED_EMAIL_DOMAIN,
  SEED_PERSONAS,
} from '../../scripts/data/sap-cpi-forum-seed';

const seedScriptSource = fs.readFileSync(
  path.join(process.cwd(), 'scripts/seed-forum.ts'),
  'utf8'
);

describe('SAP CPI Forum Seed Dataset & Script Validation', () => {
  it('defines 8-10 isolated personas under @seed.cpilancers.com with unique emails', () => {
    expect(SEED_PERSONAS.length).toBeGreaterThanOrEqual(8);
    expect(SEED_PERSONAS.length).toBeLessThanOrEqual(10);

    const emails = new Set<string>();
    for (const p of SEED_PERSONAS) {
      expect(p.email.endsWith(SEED_EMAIL_DOMAIN)).toBe(true);
      expect(emails.has(p.email)).toBe(false);
      emails.add(p.email);
    }
  });

  it('defines the 5 SAP Integration categories with unique slugs and sortOrder 1-5', () => {
    expect(SEED_CATEGORIES).toHaveLength(5);
    expect(SEED_CATEGORIES.map((c) => c.slug)).toEqual([
      'cpi-development-groovy',
      'pipo-migration',
      'adapters-s4hana-security',
      'error-handling-ops',
      'careers-projects-india',
    ]);
    expect(SEED_CATEGORIES.map((c) => c.sortOrder)).toEqual([1, 2, 3, 4, 5]);
    expect(LEGACY_CATEGORY_SLUGS).toHaveLength(9);
  });

  it('contains 25 original discussions (5 per category) with 1 pinned welcome thread', () => {
    expect(SEED_DISCUSSIONS).toHaveLength(25);
    for (const cat of SEED_CATEGORIES) {
      const count = SEED_DISCUSSIONS.filter((d) => d.categorySlug === cat.slug).length;
      expect(count).toBe(5);
    }

    const pinned = SEED_DISCUSSIONS.filter((d) => d.isPinned);
    expect(pinned).toHaveLength(1);
    expect(pinned[0]?.title).toBe(
      'Welcome to CPI Lancers — introduce yourself and your SAP Integration stack'
    );
  });

  it('validates all discussions and replies against Zod schemas and plain-text rules (no **, ###, ```)', () => {
    const personaEmails = new Set(SEED_PERSONAS.map((p) => p.email));
    const keys = new Set<string>();
    const dummyUuid = '00000000-0000-4000-8000-000000000001';
    let acceptedCount = 0;

    for (const d of SEED_DISCUSSIONS) {
      expect(keys.has(d.key)).toBe(false);
      keys.add(d.key);

      expect(personaEmails.has(d.authorEmail)).toBe(true);
      expect(d.viewCount).toBeGreaterThanOrEqual(18);
      expect(d.viewCount).toBeLessThanOrEqual(145);
      expect(d.daysAgo).toBeGreaterThanOrEqual(1);
      expect(d.daysAgo).toBeLessThanOrEqual(21);

      const discRes = createDiscussionSchema.safeParse({
        categoryId: dummyUuid,
        title: d.title,
        body: d.body,
      });
      expect(discRes.success).toBe(true);

      expect(d.title).not.toMatch(/\*\*|###|```/);
      expect(d.body).not.toMatch(/\*\*|###|```/);

      expect(d.replies.length).toBeGreaterThanOrEqual(2);
      expect(d.replies.length).toBeLessThanOrEqual(4);

      let threadAccepted = 0;
      for (const r of d.replies) {
        expect(personaEmails.has(r.authorEmail)).toBe(true);
        expect(r.authorEmail).not.toBe(d.authorEmail);
        expect(r.hoursAfterThread).toBeGreaterThanOrEqual(1);
        expect(r.hoursAfterThread).toBeLessThanOrEqual(14);

        const replyRes = createReplySchema.safeParse({ body: r.body });
        expect(replyRes.success).toBe(true);
        expect(r.body).not.toMatch(/\*\*|###|```/);

        if (r.isAccepted) {
          threadAccepted += 1;
          acceptedCount += 1;
        }
      }
      expect(threadAccepted).toBeLessThanOrEqual(1);
    }

    expect(acceptedCount).toBeGreaterThanOrEqual(12);
  });

  it('never inserts into consultant_profiles and enforces confirmation flags in seed-forum.ts', () => {
    expect(seedScriptSource).not.toContain('consultant_profiles');
    expect(seedScriptSource).toContain('--dry-run');
    expect(seedScriptSource).toContain('--confirm-seed');
    expect(seedScriptSource).toContain('--confirm-cleanup');
  });
});
