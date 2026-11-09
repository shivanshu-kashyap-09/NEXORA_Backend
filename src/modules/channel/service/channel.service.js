const channelRepository = require('../repository/channel.repository');
const { ConflictError, NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Mask sensitive credentials for safe API responses
 */
const maskCredentials = (channel) => {
  if (!channel) return channel;
  const clone = { ...channel };
  if (clone.credentials) {
    const masked = {};
    for (const [key, val] of Object.entries(clone.credentials)) {
      if (typeof val === 'string' && val.length > 6) {
        masked[key] = `${val.slice(0, 3)}****${val.slice(-3)}`;
      } else {
        masked[key] = '********';
      }
    }
    clone.credentials = masked;
  }
  return clone;
};

/**
 * Register a new sales channel connector
 */
const createChannel = async (tenantId, channelData) => {
  const existing = await channelRepository.findChannelByCode(tenantId, channelData.code);
  if (existing) {
    throw new ConflictError(`Channel with code '${channelData.code}' already exists`);
  }

  const channel = await channelRepository.createChannel({
    tenantId,
    code: channelData.code,
    name: channelData.name,
    type: channelData.type,
    isActive: channelData.is_active,
    credentials: channelData.credentials,
    settings: channelData.settings,
  });

  logger.info(`Channel registered: ${channel.code} (${channel.type}) for tenant: ${tenantId}`);
  return maskCredentials(channel);
};

/**
 * Get channel details by ID
 */
const getChannelById = async (tenantId, id) => {
  const channel = await channelRepository.getChannelById(tenantId, id);
  if (!channel) {
    throw new NotFoundError(`Channel not found with ID: ${id}`);
  }
  return maskCredentials(channel);
};

/**
 * List channels for tenant
 */
const listChannels = async (tenantId, query) => {
  return channelRepository.listChannels(tenantId, {
    type: query.type,
    isActive: query.is_active,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Update channel settings or credentials
 */
const updateChannel = async (tenantId, id, updateData) => {
  await getChannelById(tenantId, id);

  const updated = await channelRepository.updateChannel(tenantId, id, updateData);
  logger.info(`Channel updated: ${id} for tenant: ${tenantId}`);
  return maskCredentials(updated);
};

/**
 * Record channel synchronization event
 */
const recordSyncLog = async (tenantId, channelId, logData) => {
  await getChannelById(tenantId, channelId);

  const log = await channelRepository.recordSyncLog({
    tenantId,
    channelId,
    syncType: logData.sync_type,
    status: logData.status,
    details: logData.details,
  });

  logger.info(`Channel sync logged: ${channelId} [${logData.sync_type}] - ${logData.status}`);
  return log;
};

/**
 * Get sync logs for a channel
 */
const getChannelSyncLogs = async (tenantId, channelId, query) => {
  await getChannelById(tenantId, channelId);

  return channelRepository.getChannelSyncLogs(tenantId, channelId, {
    page: query.page,
    limit: query.limit,
  });
};

module.exports = {
  createChannel,
  getChannelById,
  listChannels,
  updateChannel,
  recordSyncLog,
  getChannelSyncLogs,
};

