const { z } = require('zod');
const { OutboxStatus, AggregateType } = require('../constants/event.constants');

// 1. Manually Ingest / Emit Domain Event Schema
const createEventSchema = z.object({
  aggregate_type: z.string().min(2, 'aggregate_type is required').max(64),
  aggregate_id: z.string().min(1, 'aggregate_id is required').max(128),
  event_type: z.string().min(2, 'event_type is required').max(128),
  payload: z.record(z.any()),
  scheduled_at: z.string().datetime().optional(),
});

// 2. Query Outbox Events Schema
const queryOutboxSchema = z.object({
  aggregate_type: z.string().optional(),
  event_type: z.string().optional(),
  status: z.enum([
    OutboxStatus.PENDING,
    OutboxStatus.PROCESSING,
    OutboxStatus.PUBLISHED,
    OutboxStatus.FAILED,
    OutboxStatus.DEAD,
  ]).optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

// 3. Batch Dispatch Schema
const dispatchBatchSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
});

module.exports = {
  createEventSchema,
  queryOutboxSchema,
  dispatchBatchSchema,
};
