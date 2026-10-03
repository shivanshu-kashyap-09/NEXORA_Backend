const { BadRequestError, ErrorCodes } = require('../errors');

/**
 * Tenant Context Middleware
 * Extracts and validates tenant identifier from headers (X-Tenant-ID) or JWT claims.
 */
const tenantContext = (options = { required: true }) => {
  return (req, res, next) => {
    const headerTenantId = req.headers['x-tenant-id'];
    const userTenantId = req.user?.tenantId;

    const tenantId = userTenantId || headerTenantId;

    if (!tenantId && options.required) {
      return next(new BadRequestError('Tenant context missing. Provide X-Tenant-ID header or authenticated tenant token.', ErrorCodes.TENANT_CONTEXT_MISSING));
    }

    req.tenantId = tenantId ? String(tenantId).trim() : null;
    if (req.tenantId) {
      res.setHeader('X-Tenant-ID', req.tenantId);
    }

    next();
  };
};

module.exports = tenantContext;
