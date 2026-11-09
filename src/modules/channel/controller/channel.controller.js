const catchAsync = require('../../../shared/utils/catchAsync');
const ApiResponse = require('../../../shared/utils/ApiResponse');
const channelService = require('../service/channel.service');

/**
 * Register a new sales channel connector
 */
const createChannel = catchAsync(async (req, res) => {
  const channel = await channelService.createChannel(req.user.tenantId, req.body);
  return ApiResponse.created(res, channel, 'Sales channel registered successfully');
});

/**
 * List channels for the tenant
 */
const listChannels = catchAsync(async (req, res) => {
  const result = await channelService.listChannels(req.user.tenantId, req.query);
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Channels retrieved successfully'
  );
});

/**
 * Get channel details by ID
 */
const getChannel = catchAsync(async (req, res) => {
  const channel = await channelService.getChannelById(req.user.tenantId, req.params.id);
  return ApiResponse.success(res, channel, 'Channel details retrieved successfully');
});

/**
 * Update channel settings or credentials
 */
const updateChannel = catchAsync(async (req, res) => {
  const channel = await channelService.updateChannel(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, channel, 'Channel updated successfully');
});

/**
 * Record a channel synchronization log
 */
const recordSyncLog = catchAsync(async (req, res) => {
  const log = await channelService.recordSyncLog(
    req.user.tenantId,
    req.params.id,
    req.body
  );
  return ApiResponse.created(res, log, 'Sync log recorded successfully');
});

/**
 * Get sync logs for a channel
 */
const getChannelSyncLogs = catchAsync(async (req, res) => {
  const result = await channelService.getChannelSyncLogs(
    req.user.tenantId,
    req.params.id,
    req.query
  );
  return ApiResponse.paginated(
    res,
    result.items,
    result.page,
    result.limit,
    result.total,
    'Channel sync logs retrieved successfully'
  );
});

module.exports = {
  createChannel,
  listChannels,
  getChannel,
  updateChannel,
  recordSyncLog,
  getChannelSyncLogs,
};

