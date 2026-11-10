const { z } = require('zod');
const { ActorType } = require('../constants/audit.constants');

// 1. Ingest Audit Record Schema
const createAuditSchema = z.object({
  actor_id: z.string().uuid().optional().nullable(),
  actor_type: z.enum([ActorType.USER, ActorType.API_KEY, ActorType.SYSTEM, ActorType.CRON]).default(ActorType.USER),
  action: z.string().min(2, 'action is required').max(128).trim(),
  resource_type: z.string().min(2, 'resource_type is required').max(64).trim(),
  resource_id: z.string().min(1, 'resource_id is required').max(128).trim(),
  diff_payload: z.record(z.any()).optional().default({}),
  correlation_id: z.string().max(64).optional(),
});

// 2. Query Audit Logs Schema
const queryAuditSchema = z.object({
  resource_type: z.string().optional(),
  resource_id: z.string().optional(),
  action: z.string().optional(),
  actor_id: z.string().uuid().optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

module.exports = {
  createAuditSchema,
  queryAuditSchema,
};

