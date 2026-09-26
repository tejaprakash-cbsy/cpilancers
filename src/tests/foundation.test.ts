import { describe, expect, it } from 'vitest';
import {
  CONTRACT_TRANSITIONS,
  MILESTONE_TRANSITIONS,
  contractCreateSchema,
  milestoneStatusEnum,
} from '@/lib/validations/contract.schemas';
import { registerSchema } from '@/lib/validations/auth.schemas';
import { companyProfileSchema, consultantProfileSchema } from '@/lib/validations/profile.schemas';

describe('SAP Integration Marketplace Foundation Tests', () => {
  it('should verify environment configuration is defined', () => {
    expect(process.env).toBeDefined();
  });

  it('should format currency correctly in USD cents', () => {
    const formatCurrency = (cents: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(cents / 100);
    };

    expect(formatCurrency(10000)).toBe('$100.00');
    expect(formatCurrency(155050)).toBe('$1,550.50');
  });

  it('rejects weak registration credentials', () => {
    const result = registerSchema.safeParse({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      password: 'weak',
      confirmPassword: 'weak',
      role: 'consultant',
      agreeToTerms: true,
    });

    expect(result.success).toBe(false);
  });

  it('requires a contract type or payment structure', () => {
    const result = contractCreateSchema.safeParse({
      proposal_id: '00000000-0000-0000-0000-000000000000',
      title: 'SAP integration delivery',
      terms_markdown: 'These terms describe the delivery, review, and acceptance process for this engagement.',
    });

    expect(result.success).toBe(false);
  });

  it('enforces contract and milestone state transition boundaries', () => {
    expect(CONTRACT_TRANSITIONS.pending_acceptance).toContain('active');
    expect(CONTRACT_TRANSITIONS.completed).toEqual([]);
    expect(MILESTONE_TRANSITIONS.submitted).toContain('approved');
    expect(MILESTONE_TRANSITIONS.approved).toEqual([]);
    expect(milestoneStatusEnum.safeParse('funded').success).toBe(true);
    expect(milestoneStatusEnum.safeParse('unknown').success).toBe(false);
  });

  it('validates profile input and rejects unsupported profile data', () => {
    expect(companyProfileSchema.safeParse({ legalName: 'Acme', industry: 'Technology', companySize: 'medium_51_200', sapFootprint: [] }).success).toBe(true);
    expect(consultantProfileSchema.safeParse({ professionalHeadline: 'SAP CPI consultant', yearsSapExperience: 4, yearsCpiExperience: 3, hourlyRateCents: 15000, minProjectSizeCents: 0, availabilityStatus: 'available', availableHoursPerWeek: 40, overviewMarkdown: 'A'.repeat(60) }).success).toBe(true);
    expect(companyProfileSchema.safeParse({ legalName: 'Acme', industry: 'Technology', companySize: 'admin', sapFootprint: [] }).success).toBe(false);
  });
});
