const routes = require('./routes/promotion.routes');
const service = require('./service/promotion.service');
const repository = require('./repository/promotion.repository');
const constants = require('./constants/promotion.constants');

module.exports = {
  routes,
  service,
  repository,
  constants,
};
