const routes = require('./routes/payment.routes');
const controller = require('./controller/payment.controller');
const service = require('./service/payment.service');
const repository = require('./repository/payment.repository');
const constants = require('./constants/payment.constants');

module.exports = {
  routes,
  controller,
  service,
  repository,
  constants,
};

