const { z } = require('zod');

const dateRangeQuerySchema = z.object({
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
});

module.exports = {
  dateRangeQuerySchema,
};

