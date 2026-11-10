/**
 * Audit Logging Constants
 */

const ActorType = {
  USER: 'USER',
  API_KEY: 'API_KEY',
  SYSTEM: 'SYSTEM',
  CRON: 'CRON',
};

const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  PRICE_OVERRIDE: 'PRICE_OVERRIDE',
  PERMISSION_CHANGE: 'PERMISSION_CHANGE',
  HOLD_PLACED: 'HOLD_PLACED',
  HOLD_RELEASED: 'HOLD_RELEASED',
};

module.exports = {
  ActorType,
  AuditAction,
};

