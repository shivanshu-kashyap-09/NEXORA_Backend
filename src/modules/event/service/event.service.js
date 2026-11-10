const eventRepository = require('../repository/event.repository');
const { getRedisClient } = require('../../../config/redis');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');
const logger = require('../../../config/logger');

/**
 * Ingest / Emit an Event into the Transactional Outbox
 */
const emitEvent = async (tenantId, { aggregate_type, aggregate_id, event_type, payload, scheduled_at }, client = null) => {
  const event = await eventRepository.createOutboxEvent({
    tenantId,
    aggregateType: aggregate_type,
    aggregateId: aggregate_id,
    eventType: event_type,
    payload,
    scheduledAt: scheduled_at,
  }, client);

  logger.info(`Outbox event recorded: [${event.aggregate_type}] ${event.event_type} (ID: ${event.id})`);
  return event;
};

/**
 * Dispatch pending outbox events to Redis Pub/Sub channel
 */
const dispatchPendingEvents = async ({ tenantId = null, limit = 20 }) => {
  const events = await eventRepository.fetchPendingEvents({ tenantId, limit });
  if (events.length === 0) {
    return { dispatchedCount: 0, events: [] };
  }

  const redis = getRedisClient();
  const dispatched = [];

  for (const event of events) {
    try {
      // 1. Mark as PROCESSING
      await eventRepository.markEventProcessing(event.id);

      // 2. Publish to Redis topic
      const topic = `events:${event.tenant_id}:${event.aggregate_type.toLowerCase()}`;
      const message = JSON.stringify({
        id: event.id,
        tenantId: event.tenant_id,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        eventType: event.event_type,
        payload: event.payload,
        createdAt: event.created_at,
        dispatchedAt: new Date().toISOString(),
      });

      if (redis && redis.status === 'ready') {
        await redis.publish(topic, message);
      }

      // 3. Mark as PUBLISHED
      const published = await eventRepository.markEventPublished(event.id);
      dispatched.push(published);
      logger.info(`Outbox event dispatched: ${event.id} to topic: ${topic}`);
    } catch (error) {
      logger.error(`Failed to dispatch outbox event ${event.id}: ${error.message}`);
      await eventRepository.markEventFailed(event.id, error.message);
    }
  }

  return {
    dispatchedCount: dispatched.length,
    events: dispatched,
  };
};

/**
 * Replay a failed or dead outbox event
 */
const replayEvent = async (tenantId, id) => {
  const event = await eventRepository.findOutboxEventById(tenantId, id);
  if (!event) {
    throw new NotFoundError(`Outbox event not found with ID: ${id}`);
  }

  const replayed = await eventRepository.replayDeadEvent(tenantId, id);
  logger.info(`Outbox event re-queued for retry: ${id}`);
  return replayed;
};

/**
 * List outbox events
 */
const listOutboxEvents = async (tenantId, query) => {
  return eventRepository.listOutboxEvents(tenantId, {
    aggregateType: query.aggregate_type,
    eventType: query.event_type,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });
};

/**
 * Get outbox event details by ID
 */
const getOutboxEventById = async (tenantId, id) => {
  const event = await eventRepository.findOutboxEventById(tenantId, id);
  if (!event) {
    throw new NotFoundError(`Outbox event not found with ID: ${id}`);
  }
  return event;
};

module.exports = {
  emitEvent,
  dispatchPendingEvents,
  replayEvent,
  listOutboxEvents,
  getOutboxEventById,
};

