const routes = require('./routes/omnichannel.routes');
const service = require('./service/omnichannel.service');
const repository = require('./repository/omnichannel.repository');
const constants = require('./constants/omnichannel.constants');

module.exports = {
  routes,
  service,
  repository,
  constants,
};
