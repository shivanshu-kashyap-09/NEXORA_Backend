const { z } = require('zod');

// 1. Create Sales Channel Schema
const createChannelSchema = z.object({
  code: z
    .string({ required_error: 'Channel code is required' })
    .min(2, 'Channel code must be at least 2 characters')
    .max(64, 'Channel code cannot exceed 64 characters')
    .toUpperCase()
    .trim(),
  name: z
    .string({ required_error: 'Channel name is required' })
    .min(2, 'Channel name must be at least 2 characters')
    .trim(),
  type: z
    .enum(['shopify', 'woocommerce', 'amazon', 'magento', 'custom_webhook', 'pos'], {
      required_error: 'Channel type is required',
    }),
  is_active: z.boolean().default(true),
  credentials: z.record(z.any()).default({}),
  settings: z
    .object({
      auto_sync_stock: z.boolean().default(true),
      auto_fulfill: z.boolean().default(true),
      stock_buffer_percentage: z.number().min(0).max(100).default(0),
    })
    .default({ auto_sync_stock: true, auto_fulfill: true, stock_buffer_percentage: 0 }),
});

// 2. Update Channel Schema
const updateChannelSchema = z.object({
  name: z.string().min(2).trim().optional(),
  is_active: z.boolean().optional(),
  credentials: z.record(z.any()).optional(),
  settings: z
    .object({
      auto_sync_stock: z.boolean().optional(),
      auto_fulfill: z.boolean().optional(),
      stock_buffer_percentage: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

// 3. Record Sync Log Schema
const logSyncSchema = z.object({
  sync_type: z
    .enum(['INVENTORY_PUSH', 'ORDER_INGEST', 'CATALOG_SYNC', 'FULFILLMENT_PUSH'], {
      required_error: 'Sync type is required',
    }),
  status: z.enum(['SUCCESS', 'FAILED', 'PARTIAL'], {
    required_error: 'Sync status is required',
  }),
  details: z.record(z.any()).default({}),
});

// 4. Query Channels Schema
const channelQuerySchema = z.object({
  type: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.string().regex(/^\d+$/).default('1'),
  limit: z.string().regex(/^\d+$/).default('20'),
});

module.exports = {
  createChannelSchema,
  updateChannelSchema,
  logSyncSchema,
  channelQuerySchema,
};

