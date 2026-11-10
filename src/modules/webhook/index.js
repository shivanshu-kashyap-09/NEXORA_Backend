const webhookRoutes = require('./routes/webhook.routes');
const webhookService = require('./service/webhook.service');
const webhookConstants = require('./constants/webhook.constants');

module.exports = {
  webhookRoutes,
  webhookService,
  webhookConstants,
};
