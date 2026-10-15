import { z } from 'zod';

export const createDiscussionSchema = z.object({
  categoryId: z.string().uuid({ message: 'Valid category ID is required.' }),
  title: z
    .string()
    .trim()
    .min(3, { message: 'Title must be at least 3 characters.' })
    .max(150, { message: 'Title must not exceed 150 characters.' }),
  body: z
    .string()
    .trim()
    .min(5, { message: 'Discussion body must be at least 5 characters.' })
    .max(20000, { message: 'Discussion body must not exceed 20,000 characters.' }),
});

export const createReplySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { message: 'Reply cannot be empty.' })
    .max(10000, { message: 'Reply must not exceed 10,000 characters.' }),
});

export type CreateDiscussionInput = z.infer<typeof createDiscussionSchema>;
export type CreateReplyInput = z.infer<typeof createReplySchema>;

export { createDiscussionSchema as forumDiscussionSchema, createReplySchema as forumReplySchema };
