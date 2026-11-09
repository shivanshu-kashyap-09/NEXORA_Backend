const routes = require('./routes/tenant.routes');
const controller = require('./controller/tenant.controller');
const service = require('./service/tenant.service');
const repository = require('./repository/tenant.repository');

module.exports = {
  routes,
  controller,
  service,
  repository,
};

