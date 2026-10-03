const database = require('../../config/database');
const { withTenantTransaction, withTenantQuery } = require('./tenantTransaction');

module.exports = {
  ...database,
  withTenantTransaction,
  withTenantQuery,
};
