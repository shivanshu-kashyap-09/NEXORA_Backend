const routes = require('./routes/channel.routes');
const controller = require('./controller/channel.controller');
const service = require('./service/channel.service');
const repository = require('./repository/channel.repository');
const constants = require('./constants/channel.constants');

module.exports = {
  routes,
  controller,
  service,
  repository,
  constants,
};

