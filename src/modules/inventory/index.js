const routes = require('./routes/inventory.routes');
const controller = require('./controller/inventory.controller');
const service = require('./service/inventory.service');
const repository = require('./repository/inventory.repository');
const constants = require('./constants/inventory.constants');

module.exports = {
  routes,
  controller,
  service,
  repository,
  constants,
};

