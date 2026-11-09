const routes = require('./routes/catalog.routes');
const controller = require('./controller/catalog.controller');
const service = require('./service/catalog.service');
const repository = require('./repository/catalog.repository');

module.exports = {
  routes,
  controller,
  service,
  repository,
};

