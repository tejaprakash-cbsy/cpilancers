/**
 * Job Form Validation Schemas
 * Using Zod for type-safe validation
 */

import { z } from 'zod';

// Import enums from types - we'll reference them as strings since we can't import types directly in schema
// But we can create z.enums based on the database enums

// Budget type
export const budgetTypeEnum = z.enum(['fixed_price', 'hourly_rate', 'range']);
// Integration type
export const integrationTypeEnum = z.enum([
  'p2p', 'a2a', 'b2b', 'batch', 'realtime', 'event_driven', 'hybrid'
]);
// Throughput tier
export const throughputTierEnum = z.enum([
  'low_under_1k_daily', 'moderate_1k_100k', 'high_100k_1m', 'mission_critical_1m_plus'
]);
// Complexity tier
export const complexityTierEnum = z.enum(['standard', 'moderate', 'complex', 'architectural']);
// Payment structure
export const paymentStructureEnum = z.enum(['fixed_milestones', 'hourly_capped']);
// Job status
export const jobStatusEnum = z.enum([
  'draft', 'open', 'in_review', 'hired', 'completed', 'cancelled', 'closed'
]);

// SAP products involved (we'll create a list based on the prompt)
export const sapProductEnum = z.enum([
  'SAP_Cloud_Integration',
  'SAP_Integration_Suite', 
  'SAP_S4HANA',
  'SAP_ECC',
  'SAP_SuccessFactors',
  'SAP_Ariba',
  'API_Management',
  'Event_Mesh',
  'REST',
  'SOAP',
  'OData',
  'IDoc',
  'SFTP',
  'JDBC',
  'OAuth'
]);

// Validation helpers
const titleSchema = z
  .string()
  .min(5, 'Job title must be at least 5 characters')
  .max(200, 'Job title must be less than 200 characters');

const descriptionSchema = z
  .string()
  .min(50, 'Job description must be at least 50 characters')
  .max(10000, 'Job description must be less than 10,000 characters');

const durationSchema = z
  .number()
  .int()
  .min(1, 'Estimated duration must be at least 1 week')
  .max(52, 'Estimated duration cannot exceed 52 weeks');

const budgetFixedSchema = z
  .number()
  .int()
  .min(100, 'Budget must be at least $1.00') // 100 cents = $1
  .max(10000000, 'Budget cannot exceed $100,000.00'); // 10,000,000 cents = $100,000

const budgetMinSchema = z
  .number()
  .int()
  .min(100, 'Minimum budget must be at least $1.00')
  .max(10000000, 'Maximum budget cannot exceed $100,000.00');

const budgetMaxSchema = z
  .number()
  .int()
  .min(100, 'Minimum budget must be at least $1.00')
  .max(10000000, 'Maximum budget cannot exceed $100,000.00');

const experienceSchema = z
  .number()
  .int()
  .min(0, 'Years of experience cannot be negative')
  .max(50, 'Years of experience cannot exceed 50');

/**
 * Job Creation Form Schema
 */
export const jobCreateSchema = z.object({
  title: titleSchema,
  description_markdown: descriptionSchema,
  
  // SAP Information
  sap_products: z.array(sapProductEnum).nonempty('At least one SAP product must be selected'),
  source_systems: z.array(z.string()).nonempty('At least one source system must be specified'),
  target_systems: z.array(z.string()).nonempty('At least one target system must be specified'),
  integration_type: integrationTypeEnum,
  protocols: z.array(z.string()).nonempty('At least one protocol must be specified'),
  
  // Requirements
  authentication_requirements: z.string().max(1000, 'Authentication requirements must be less than 1,000 characters'),
  data_transformation_requirements: z.string().max(1000, 'Data transformation requirements must be less than 1,000 characters'),
  error_handling_requirements: z.string().max(1000, 'Error handling requirements must be less than 1,000 characters'),
  monitoring_requirements: z.string().max(1000, 'Monitoring requirements must be less than 1,000 characters'),
  testing_requirements: z.string().max(1000, 'Testing requirements must be less than 1,000 characters'),
  deployment_requirements: z.string().max(1000, 'Deployment requirements must be less than 1,000 characters'),
  
  // Basic Information
  estimated_duration_weeks: durationSchema,
  experience_required: experienceSchema,
  
  // Budget
  budget_type: budgetTypeEnum,
  budget_fixed_cents: budgetFixedSchema.optional(),
  budget_min_cents: budgetMinSchema.optional(),
  budget_max_cents: budgetMaxSchema.optional(),
  
  // Additional fields
  project_type: z.string().max(100, 'Project type must be less than 100 characters'),
  deadline: z.string().refine((date) => !isNaN(Date.parse(date)), 'Please enter a valid deadline date'),
});

export type JobCreateFormData = z.infer<typeof jobCreateSchema>;

/**
 * Job Edit Form Schema (same as create but all fields optional for partial updates)
 */
export const jobEditSchema = jobCreateSchema.partial().extend({
  // We still need to enforce that if budget_type is provided, the relevant budget fields are present
  // But we'll handle that in the service layer or with refinements
  // For simplicity, we'll make all optional and validate in service
});

export type JobEditFormData = z.infer<typeof jobEditSchema>;

/**
 * Job Filter Schema (for browsing/searching)
 */
export const jobFilterSchema = z.object({
  search: z.string().optional(),
  sapProducts: z.array(sapProductEnum).optional(),
  sourceSystems: z.array(z.string()).optional(),
  targetSystems: z.array(z.string()).optional(),
  integrationTypes: z.array(integrationTypeEnum).optional(),
  protocols: z.array(z.string()).optional(),
  budgetMin: z.number().int().min(0).optional(),
  budgetMax: z.number().int().min(0).optional(),
  // `experienceMin` was removed: it mapped to a `experience_required` column
  // that does not exist on `jobs`, so applying it failed the whole query.
  budgetType: z.enum(['fixed_price', 'hourly_rate', 'range']).optional(),
  status: z.array(jobStatusEnum).optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'views_count']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
});

export type JobFilterFormData = z.infer<typeof jobFilterSchema>;