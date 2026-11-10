const routes = require('./routes/audit.routes');
const service = require('./service/audit.service');
const repository = require('./repository/audit.repository');
const constants = require('./constants/audit.constants');

module.exports = {
  routes,
  service,
  repository,
  constants,
};
