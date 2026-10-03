const { BadRequestError, ErrorCodes } = require('../errors');

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
          const formatted = parsedParams.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          }));
          return next(new BadRequestError('Invalid route parameters', ErrorCodes.VALIDATION_ERROR, formatted));
        }
        req.params = parsedParams.data;
      }

      if (schemas.query) {
        const parsedQuery = schemas.query.safeParse(req.query);
        if (!parsedQuery.success) {
          const formatted = parsedQuery.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          }));
          return next(new BadRequestError('Invalid query parameters', ErrorCodes.VALIDATION_ERROR, formatted));
        }
        req.query = parsedQuery.data;
      }

      if (schemas.body) {
        const parsedBody = schemas.body.safeParse(req.body);
        if (!parsedBody.success) {
          const formatted = parsedBody.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          }));
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
