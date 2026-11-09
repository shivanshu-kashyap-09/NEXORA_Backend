const routes = require('./routes/shipment.routes');
const controller = require('./controller/shipment.controller');
const service = require('./service/shipment.service');
const repository = require('./repository/shipment.repository');
const constants = require('./constants/shipment.constants');

module.exports = {
  routes,
  controller,
  service,
  repository,
  constants,
};

