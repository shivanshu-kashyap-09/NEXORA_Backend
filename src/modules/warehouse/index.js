const routes = require('./routes/warehouse.routes');
const controller = require('./controller/warehouse.controller');
const service = require('./service/warehouse.service');
const repository = require('./repository/warehouse.repository');

module.exports = {
  routes,
  controller,
  service,
  repository,
};

