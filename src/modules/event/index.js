const routes = require('./routes/event.routes');
const service = require('./service/event.service');
const repository = require('./repository/event.repository');
const constants = require('./constants/event.constants');

module.exports = {
  routes,
  service,
  repository,
  constants,
};
