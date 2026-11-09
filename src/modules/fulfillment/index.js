const routes = require('./routes/fulfillment.routes');
const controller = require('./controller/fulfillment.controller');
const service = require('./service/fulfillment.service');
const repository = require('./repository/fulfillment.repository');
const constants = require('./constants/fulfillment.constants');

module.exports = {
  routes,
  controller,
  service,
  repository,
  constants,
};

