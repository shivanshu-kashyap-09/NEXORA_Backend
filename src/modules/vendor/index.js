const vendorRoutes = require('./routes/vendor.routes');
const poRoutes = require('./routes/po.routes');
const service = require('./service/vendor.service');
const repository = require('./repository/vendor.repository');
const constants = require('./constants/vendor.constants');

module.exports = {
  vendorRoutes,
  poRoutes,
  service,
  repository,
  constants,
};
