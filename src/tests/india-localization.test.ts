import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatCurrency } from '@/lib/utils';

const consultantsPage = fs.readFileSync(
  path.join(process.cwd(), 'src/app/consultants/page.tsx'),
  'utf8'
);
const jobsPage = fs.readFileSync(
  path.join(process.cwd(), 'src/app/jobs/page.tsx'),
  'utf8'
);
const profilePage = fs.readFileSync(
  path.join(process.cwd(), 'src/app/profile/page.tsx'),
  'utf8'
);

describe('India Localization & Consultants Page Polish', () => {
  it('formatCurrency defaults to INR (₹) with en-IN grouping', () => {
    expect(formatCurrency(15000000)).toBe('₹1,50,000');
    expect(formatCurrency(500000)).toBe('₹5,000');
    expect(formatCurrency(150050)).toBe('₹1,500.5');
    expect(formatCurrency(150000, 'USD')).toBe('$1,500');
  });

  it('standardizes hourly rate buckets on /consultants to INR', () => {
    expect(consultantsPage).toContain('₹5,000+ / hr');
    expect(consultantsPage).toContain('₹3,000 – ₹4,999 / hr');
    expect(consultantsPage).toContain('₹1,500 – ₹2,999 / hr');
    expect(consultantsPage).toContain('Under ₹1,500 / hr');
    expect(consultantsPage).not.toContain('$75+ / hour');
    expect(consultantsPage).not.toContain('Under $25 / hour');
  });

  it('includes Indian languages and Indian SAP hub locations on /consultants', () => {
    for (const lang of ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'German']) {
      expect(consultantsPage).toContain(lang);
    }
    expect(consultantsPage).not.toContain('Spanish');
    expect(consultantsPage).not.toContain('French');

    for (const hub of [
      'Anywhere in India',
      'Bengaluru',
      'Hyderabad',
      'Pune',
      'Chennai',
      'Mumbai',
      'Delhi NCR',
      'Kolkata',
      'Remote (India)',
      'Global / Remote',
    ]) {
      expect(consultantsPage).toContain(hub);
    }
  });

  it('replaces generic freelance pills with SAP Integration domains on /consultants', () => {
    expect(consultantsPage).toContain('All consultants');
    expect(consultantsPage).toContain('Cloud Integration (CPI)');
    expect(consultantsPage).toContain('Integration Suite');
    expect(consultantsPage).toContain('PI/PO Migration');
    expect(consultantsPage).toContain('API Management');
    expect(consultantsPage).toContain('Event Mesh');
    expect(consultantsPage).toContain('Groovy & XSLT');

    for (const genericPill of ["'Design'", "'Marketing'", "'Writing'", "'Finance'"]) {
      expect(consultantsPage).not.toContain(genericPill);
    }
  });

  it('removes backend/API jargon from /consultants and links to /profile and /forum', () => {
    expect(consultantsPage).not.toContain('consultant profile API');
    expect(consultantsPage).not.toContain('list endpoint');
    expect(consultantsPage).toContain('Founding SAP Consultant Directory');
    expect(consultantsPage).toContain('href="/profile"');
    expect(consultantsPage).toContain('href="/forum"');
  });

  it('localizes /jobs budget filters and /profile timezone fallback to India', () => {
    expect(jobsPage).toContain('₹50,000+');
    expect(jobsPage).toContain('₹10,000–₹49,999');
    expect(jobsPage).toContain('₹5,000–₹9,999');
    expect(profilePage).toContain('IST (UTC+5:30)');
  });
});
