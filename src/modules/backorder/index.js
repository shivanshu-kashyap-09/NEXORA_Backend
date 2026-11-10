const routes = require('./routes/backorder.routes');
const service = require('./service/backorder.service');
const repository = require('./repository/backorder.repository');
const constants = require('./constants/backorder.constants');

module.exports = {
  routes,
  service,
  repository,
  constants,
};
