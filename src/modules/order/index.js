const routes = require('./routes/order.routes');
const controller = require('./controller/order.controller');
const service = require('./service/order.service');
const repository = require('./repository/order.repository');
const constants = require('./constants/order.constants');

module.exports = {
  routes,
  controller,
  service,
  repository,
  constants,
};

