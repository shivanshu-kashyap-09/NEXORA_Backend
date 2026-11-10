const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const webhookService = require('../service/webhook.service');

const createWebhook = catchAsync(async (req, res) => {
  const webhook = await webhookService.registerWebhook(req.user.tenantId, req.body);
  return ApiResponse.created(res, webhook, 'Webhook created successfully');
});

const getWebhooks = catchAsync(async (req, res) => {
  const result = await webhookService.listWebhooks(req.user.tenantId, req.query);
  return ApiResponse.success(res, result.data, 'Webhooks retrieved successfully', 200, result.meta);
});

const getWebhookById = catchAsync(async (req, res) => {
  const webhook = await webhookService.getWebhook(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, webhook, 'Webhook details retrieved successfully');
});

const updateWebhook = catchAsync(async (req, res) => {
  const webhook = await webhookService.updateWebhook(req.user.tenantId, req.params.id, req.body);
  return ApiResponse.success(res, webhook, 'Webhook updated successfully');
});

const deleteWebhook = catchAsync(async (req, res) => {
  await webhookService.removeWebhook(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, null, 'Webhook deleted successfully');
});

const testWebhook = catchAsync(async (req, res) => {
  const result = await webhookService.testDispatchWebhook(req.user.tenantId, req.params.id, req.body);
  return ApiResponse.success(res, result, 'Webhook test ping triggered');
});

const getWebhookDeliveries = catchAsync(async (req, res) => {
  const deliveries = await webhookService.getWebhookDeliveries(req.user.tenantId, req.params.id, req.query);
  return ApiResponse.success(res, deliveries, 'Webhook deliveries retrieved');
});

module.exports = {
  createWebhook,
  getWebhooks,
  getWebhookById,
  updateWebhook,
  deleteWebhook,
  testWebhook,
  getWebhookDeliveries,
};
