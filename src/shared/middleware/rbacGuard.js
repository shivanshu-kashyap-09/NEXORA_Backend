const { ForbiddenError, ErrorCodes } = require('../errors');

/**
 * Role-Based Access Control (RBAC) Guard
 * @param {string[]} requiredRoles - Allowed roles e.g. ['SUPERADMIN', 'TENANT_ADMIN', 'OPERATOR']
 * @param {string[]} requiredPermissions - Required permissions e.g. ['order:write', 'inventory:reserve']
 */
const rbacGuard = ({ roles = [], permissions = [] } = {}) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return next(new ForbiddenError('User context missing for authorization check', ErrorCodes.FORBIDDEN));
    }

    // Platform SuperAdmin bypasses role check
    if (user.role === 'SUPERADMIN') {
      return next();
    }

    // Role check
    if (roles.length > 0 && !roles.includes(user.role)) {
      return next(new ForbiddenError(`Access denied. Role '${user.role}' is not authorized.`, ErrorCodes.INSUFFICIENT_PERMISSIONS));
    }

    // Permission check
    if (permissions.length > 0) {
      const userPermissions = user.permissions || [];
      const hasAllPermissions = permissions.every((perm) => userPermissions.includes(perm));
      if (!hasAllPermissions) {
        return next(new ForbiddenError('Access denied. Missing required permission scope.', ErrorCodes.INSUFFICIENT_PERMISSIONS));
      }
    }

    next();
  };
};

module.exports = rbacGuard;
