const routes = require('./routes/reporting.routes');
const service = require('./service/reporting.service');
const repository = require('./repository/reporting.repository');
const constants = require('./constants/reporting.constants');

module.exports = {
  routes,
  service,
  repository,
  constants,
};
