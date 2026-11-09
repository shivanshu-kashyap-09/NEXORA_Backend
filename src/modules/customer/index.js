const routes = require('./routes/customer.routes');
const controller = require('./controller/customer.controller');
const service = require('./service/customer.service');
const repository = require('./repository/customer.repository');
const constants = require('./constants/customer.constants');

module.exports = {
  routes,
  controller,
  service,
  repository,
  constants,
};

