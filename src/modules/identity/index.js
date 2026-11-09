const routes = require('./routes/identity.routes');
const controller = require('./controller/identity.controller');
const service = require('./service/identity.service');
const repository = require('./repository/identity.repository');

module.exports = {
  routes,
  controller,
  service,
  repository,
};
