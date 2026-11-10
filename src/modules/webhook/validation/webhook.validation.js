const { z } = require('zod');

const createWebhookSchema = z.object({
  url: z.string().url('A valid destination URL is required'),
  secret: z.string().min(16, 'Secret must be at least 16 characters').optional(),
  events: z.array(z.string()).min(1, 'At least one event or wildcard "*" is required'),
  description: z.string().max(255).optional(),
  headers: z.record(z.string()).optional().default({}),
});

const updateWebhookSchema = z.object({
  url: z.string().url('A valid destination URL is required').optional(),
  secret: z.string().min(16).optional(),
  events: z.array(z.string()).min(1).optional(),
  description: z.string().max(255).optional(),
  is_active: z.boolean().optional(),
  headers: z.record(z.string()).optional(),
});

const listWebhooksSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  is_active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

const testWebhookSchema = z.object({
  event_type: z.string().default('ping'),
  payload: z.record(z.any()).optional().default({ message: 'NEXORA webhook ping test', timestamp: new Date().toISOString() }),
});

module.exports = {
  createWebhookSchema,
  updateWebhookSchema,
  listWebhooksSchema,
  testWebhookSchema,
};

