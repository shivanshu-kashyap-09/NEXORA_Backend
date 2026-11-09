const { BadRequestError, ErrorCodes } = require('../errors');

/**
 * Extract formatted issues from Zod error (compatible with Zod v3 and v4)
 */
const formatZodIssues = (zodError) => {
  const issues = zodError.issues || zodError.errors || [];
  return issues.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
};

/**
 * Zod Request Validation Middleware
 * @param {object} schemas - { body?: ZodSchema, query?: ZodSchema, params?: ZodSchema }
 */
const validateRequest = (schemas = {}) => {
  return (req, res, next) => {
    try {
      if (schemas.params) {
        const parsedParams = schemas.params.safeParse(req.params);
        if (!parsedParams.success) {
          const formatted = formatZodIssues(parsedParams.error);
          return next(new BadRequestError('Invalid route parameters', ErrorCodes.VALIDATION_ERROR, formatted));
        }
        req.params = parsedParams.data;
      }

      if (schemas.query) {
        const parsedQuery = schemas.query.safeParse(req.query);
        if (!parsedQuery.success) {
          const formatted = formatZodIssues(parsedQuery.error);
          return next(new BadRequestError('Invalid query parameters', ErrorCodes.VALIDATION_ERROR, formatted));
        }
        req.query = parsedQuery.data;
      }

      if (schemas.body) {
        const parsedBody = schemas.body.safeParse(req.body);
        if (!parsedBody.success) {
          const formatted = formatZodIssues(parsedBody.error);
          return next(new BadRequestError('Invalid request payload', ErrorCodes.VALIDATION_ERROR, formatted));
        }
        req.body = parsedBody.data;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = validateRequest;
