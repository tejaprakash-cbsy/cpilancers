/**
 * Profile Form Validation Schemas
 * Using Zod for type-safe validation
 */

import { z } from 'zod';

// Name validation
const nameSchema = z
  .string()
  .min(2, 'Must be at least 2 characters')
  .max(50, 'Must be less than 50 characters')
  .regex(/^[a-zA-Z\s'-]+$/, 'Only letters, spaces, hyphens, and apostrophes allowed');

// Bio/summary validation
const bioSchema = z
  .string()
  .max(500, 'Bio must be less than 500 characters')
  .optional()
  .nullable();

// Timezone validation
const timezoneSchema = z
  .string()
  .default('UTC');

// Country code validation (ISO 3166-1 alpha-2)
const countryCodeSchema = z
  .string()
  .length(2, 'Country code must be 2 characters')
  .regex(/^[A-Z]{2}$/, 'Must be a valid ISO country code')
  .default('US');

// City validation
const citySchema = z
  .string()
  .max(100, 'City name must be less than 100 characters')
  .optional()
  .nullable();

/**
 * Profile Form Schema
 */
export const profileSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(100, 'Display name must be less than 100 characters'),
  bioSummary: bioSchema,
  timezone: timezoneSchema,
  countryCode: countryCodeSchema,
  city: citySchema,
});

export type ProfileFormData = z.infer<typeof profileSchema>;

/**
 * Consultant Profile Form Schema
 */
export const consultantProfileSchema = z.object({
  professionalHeadline: z
    .string()
    .min(5, 'Professional headline must be at least 5 characters')
    .max(200, 'Professional headline must be less than 200 characters'),
  yearsSapExperience: z
    .number()
    .min(0, 'Years of experience cannot be negative')
    .max(50, 'Years of experience cannot exceed 50')
    .default(0),
  yearsCpiExperience: z
    .number()
    .min(0, 'Years of CPI experience cannot be negative')
    .max(50, 'Years of CPI experience cannot exceed 50')
    .default(0),
  hourlyRateCents: z
    .number()
    .min(1500, 'Hourly rate must be at least $15.00') // $15.00 minimum
    .max(100000, 'Hourly rate cannot exceed $1,000.00') // $1,000.00 maximum
    .default(0),
  minProjectSizeCents: z
    .number()
    .min(0, 'Minimum project size cannot be negative')
    .default(0),
  availabilityStatus: z
    .enum(['available', 'partially_available', 'busy', 'unavailable'])
    .default('available'),
  availableHoursPerWeek: z
    .number()
    .min(0, 'Available hours per week cannot be negative')
    .max(168, 'Available hours per week cannot exceed 168 (hours in a week)')
    .default(40),
  githubProfileUrl: z
    .string()
    .url('Please enter a valid GitHub URL')
    .optional()
    .nullable(),
  linkedinProfileUrl: z
    .string()
    .url('Please enter a valid LinkedIn URL')
    .optional()
    .nullable(),
  overviewMarkdown: z
    .string()
    .min(50, 'Overview must be at least 50 characters')
    .max(5000, 'Overview must be less than 5000 characters'),
});

export type ConsultantProfileFormData = z.infer<typeof consultantProfileSchema>;

/**
 * Client Profile Form Schema
 */
export const clientProfileSchema = z.object({
  jobTitle: z
    .string()
    .min(2, 'Job title must be at least 2 characters')
    .max(100, 'Job title must be less than 100 characters'),
  department: z
    .string()
    .max(100, 'Department name must be less than 100 characters')
    .optional()
    .nullable(),
  billingEmail: z
    .string()
    .email('Please enter a valid email address')
    .optional()
    .nullable(),
});

export type ClientProfileFormData = z.infer<typeof clientProfileSchema>;

export const companyProfileSchema = z.object({
  legalName: z.string().min(2).max(200),
  brandName: z.string().max(200).optional().nullable(),
  websiteUrl: z.string().url().optional().nullable(),
  industry: z.string().min(2).max(100),
  companySize: z.enum(['startup_1_10', 'small_11_50', 'medium_51_200', 'midmarket_201_1000', 'enterprise_1000_plus']),
  sapFootprint: z.array(z.string().max(100)).max(50),
});

export type CompanyProfileFormData = z.infer<typeof companyProfileSchema>;

/**
 * Skill Form Schema (for adding/editing skills)
 */
export const skillFormSchema = z.object({
  skillId: z.string().uuid('Please select a valid skill'),
  isPrimary: z.boolean().default(false),
  yearsExperience: z
    .number()
    .min(0, 'Years of experience cannot be negative')
    .max(50, 'Years of experience cannot exceed 50')
    .default(1),
  proficiencyLevel: z
    .enum(['beginner', 'intermediate', 'advanced', 'expert'])
    .default('advanced'),
});

export type SkillFormData = z.infer<typeof skillFormSchema>;

/**
 * Certification Form Schema
 */
export const certificationFormSchema = z.object({
  certificationId: z.string().uuid().optional(), // Optional because custom certifications are allowed
  customName: z
    .string()
    .max(200, 'Certification name must be less than 200 characters')
    .optional()
    .nullable(),
  credentialId: z
    .string()
    .max(100, 'Credential ID must be less than 100 characters')
    .optional()
    .nullable(),
  issueDate: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), 'Please enter a valid date'),
  expiryDate: z
    .string()
    .refine((date) => !date || !isNaN(Date.parse(date)), 'Please enter a valid date')
    .optional()
    .nullable(),
  verificationDocumentUrl: z
    .string()
    .url('Please enter a valid URL for the verification document'),
});

export type CertificationFormData = z.infer<typeof certificationFormSchema>;

/**
 * Portfolio Form Schema
 */
export const portfolioFormSchema = z.object({
  title: z
    .string()
    .min(5, 'Portfolio title must be at least 5 characters')
    .max(200, 'Portfolio title must be less than 200 characters'),
  clientIndustry: z
    .string()
    .min(2, 'Client industry must be at least 2 characters')
    .max(100, 'Client industry must be less than 100 characters'),
  sourceSystems: z
    .array(z.string())
    .default([]),
  targetSystems: z
    .array(z.string())
    .default([]),
  protocolsUsed: z
    .array(z.string())
    .default([]),
  challengeMarkdown: z
    .string()
    .min(50, 'Challenge description must be at least 50 characters')
    .max(5000, 'Challenge description must be less than 5000 characters'),
  solutionMarkdown: z
    .string()
    .min(50, 'Solution description must be at least 50 characters')
    .max(5000, 'Solution description must be less than 5000 characters'),
  outcomeMarkdown: z
    .string()
    .max(5000, 'Outcome description must be less than 5000 characters')
    .optional()
    .nullable(),
  architectureDiagramUrl: z
    .string()
    .url('Please enter a valid URL for the architecture diagram')
    .optional()
    .nullable(),
  completedAt: z
    .string()
    .refine((date) => !date || !isNaN(Date.parse(date)), 'Please enter a valid date')
    .optional()
    .nullable(),
});

export type PortfolioFormData = z.infer<typeof portfolioFormSchema>;
