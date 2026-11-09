const { withTenantTransaction } = require('../../../infrastructure/database/tenantTransaction');
const logger = require('../../../config/logger');
const { ShipmentStatus } = require('../constants/shipment.constants');

/**
 * Create a new shipment and advance fulfillment & order status
 */
const createShipment = async ({
  tenantId,
  fulfillmentId,
  carrier,
  serviceTier = 'Standard',
  trackingNumber,
  trackingUrl,
  shippingLabelUrl,
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Generate tracking number if not supplied
    const finalTrackingNumber =
      trackingNumber ||
      `NX-${carrier.toUpperCase().slice(0, 3)}-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const finalTrackingUrl =
      trackingUrl || `https://tracking.nexora.io/track/${finalTrackingNumber}`;

    // 2. Insert into shipments
    const shipQuery = `
      INSERT INTO shipments (
        tenant_id, fulfillment_id, carrier, service_tier, tracking_number,
        tracking_url, shipping_label_url, status, shipped_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), NOW())
      RETURNING *;
    `;
    const shipRes = await client.query(shipQuery, [
      tenantId,
      fulfillmentId,
      carrier,
      serviceTier,
      finalTrackingNumber,
      finalTrackingUrl,
      shippingLabelUrl || null,
      ShipmentStatus.SHIPPED,
    ]);
    const shipment = shipRes.rows[0];

    // 3. Advance fulfillment status to SHIPPED
    const fulRes = await client.query(
      `
      UPDATE fulfillments
      SET status = 'SHIPPED', updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
      RETURNING order_id;
    `,
      [tenantId, fulfillmentId]
    );
    const orderId = fulRes.rows[0]?.order_id;

    // 4. Advance order status to FULFILLED
    if (orderId) {
      await client.query(
        `
        UPDATE orders
        SET status = 'FULFILLED', updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2 AND status != 'COMPLETED';
      `,
        [tenantId, orderId]
      );
    }

    // 5. Insert initial tracking checkpoint
    const eventQuery = `
      INSERT INTO shipment_tracking_events (
        tenant_id, shipment_id, checkpoint_status, location, event_timestamp, raw_payload, created_at
      )
      VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
      RETURNING *;
    `;
    const eventRes = await client.query(eventQuery, [
      tenantId,
      shipment.id,
      'CARRIER_DISPATCHED',
      'Origin Distribution Hub',
      JSON.stringify({ carrier, service_tier: serviceTier }),
    ]);

    return {
      ...shipment,
      tracking_events: [eventRes.rows[0]],
    };
  });
};

/**
 * Get shipment details by ID with fulfillment, order, and tracking events
 */
const findShipmentById = async (tenantId, id) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Fetch shipment
    const shipQuery = `
      SELECT s.*, f.warehouse_id, f.order_id, o.order_number, w.name AS warehouse_name
      FROM shipments s
      JOIN fulfillments f ON f.id = s.fulfillment_id
      JOIN orders o ON o.id = f.order_id
      JOIN warehouses w ON w.id = f.warehouse_id
      WHERE s.tenant_id = $1 AND s.id = $2;
    `;
    const shipRes = await client.query(shipQuery, [tenantId, id]);
    const shipment = shipRes.rows[0];
    if (!shipment) return null;

    // 2. Fetch tracking checkpoints
    const eventsQuery = `
      SELECT *
      FROM shipment_tracking_events
      WHERE tenant_id = $1 AND shipment_id = $2
      ORDER BY event_timestamp DESC;
    `;
    const eventsRes = await client.query(eventsQuery, [tenantId, id]);

    return {
      ...shipment,
      tracking_events: eventsRes.rows,
    };
  });
};

/**
 * List shipments with filters and pagination
 */
const listShipments = async (tenantId, { fulfillmentId, carrier, status, trackingNumber, page = 1, limit = 20 }) => {
  return withTenantTransaction(tenantId, async (client) => {
    const offset = (page - 1) * limit;
    const params = [tenantId];
    let whereClauses = ['s.tenant_id = $1'];

    if (fulfillmentId) {
      params.push(fulfillmentId);
      whereClauses.push(`s.fulfillment_id = $${params.length}`);
    }

    if (carrier) {
      params.push(carrier);
      whereClauses.push(`s.carrier ILIKE $${params.length}`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`s.status = $${params.length}`);
    }

    if (trackingNumber) {
      params.push(trackingNumber);
      whereClauses.push(`s.tracking_number = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    // Total count
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM shipments s
      WHERE ${whereStr};
    `;
    const countRes = await client.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data query
    params.push(limit, offset);
    const dataQuery = `
      SELECT s.*, o.order_number, f.order_id
      FROM shipments s
      JOIN fulfillments f ON f.id = s.fulfillment_id
      JOIN orders o ON o.id = f.order_id
      WHERE ${whereStr}
      ORDER BY s.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;
    const dataRes = await client.query(dataQuery, params);

    return {
      items: dataRes.rows,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };
  });
};

/**
 * Add a carrier tracking checkpoint event and advance status to DELIVERED / COMPLETED if appropriate
 */
const addTrackingEvent = async ({
  tenantId,
  shipmentId,
  checkpointStatus,
  location,
  eventTimestamp,
  rawPayload = {},
}) => {
  return withTenantTransaction(tenantId, async (client) => {
    // 1. Lock shipment
    const lockRes = await client.query(
      `SELECT * FROM shipments WHERE tenant_id = $1 AND id = $2 FOR UPDATE;`,
      [tenantId, shipmentId]
    );
    const shipment = lockRes.rows[0];
    if (!shipment) {
      const err = new Error(`Shipment not found with ID: ${shipmentId}`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Insert event
    const eventQuery = `
      INSERT INTO shipment_tracking_events (
        tenant_id, shipment_id, checkpoint_status, location, event_timestamp, raw_payload, created_at
      )
      VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, NOW())
      RETURNING *;
    `;
    const eventRes = await client.query(eventQuery, [
      tenantId,
      shipmentId,
      checkpointStatus,
      location || null,
      eventTimestamp || null,
      JSON.stringify(rawPayload),
    ]);
    const event = eventRes.rows[0];

    // 3. If delivered, update shipment & order status
    if (checkpointStatus.toUpperCase() === 'DELIVERED') {
      await client.query(
        `
        UPDATE shipments
        SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2;
      `,
        [tenantId, shipmentId]
      );

      // Find order and mark COMPLETED
      const fulRes = await client.query(
        `SELECT order_id FROM fulfillments WHERE tenant_id = $1 AND id = $2;`,
        [tenantId, shipment.fulfillment_id]
      );
      if (fulRes.rows[0]) {
        await client.query(
          `
          UPDATE orders
          SET status = 'COMPLETED', updated_at = NOW()
          WHERE tenant_id = $1 AND id = $2;
        `,
          [tenantId, fulRes.rows[0].order_id]
        );
      }
    }

    return event;
  });
};

/**
 * Update shipment status
 */
const updateShipmentStatus = async (tenantId, id, newStatus) => {
  return withTenantTransaction(tenantId, async (client) => {
    const isDelivered = newStatus === ShipmentStatus.DELIVERED;

    const query = `
      UPDATE shipments
      SET 
        status = $1,
        delivered_at = CASE WHEN $2::boolean THEN NOW() ELSE delivered_at END,
        updated_at = NOW()
      WHERE tenant_id = $3 AND id = $4
      RETURNING *;
    `;
    const res = await client.query(query, [newStatus, isDelivered, tenantId, id]);
    const shipment = res.rows[0];

    if (!shipment) {
      const err = new Error(`Shipment not found with ID: ${id}`);
      err.statusCode = 404;
      throw err;
    }

    if (isDelivered) {
      const fulRes = await client.query(
        `SELECT order_id FROM fulfillments WHERE tenant_id = $1 AND id = $2;`,
        [tenantId, shipment.fulfillment_id]
      );
      if (fulRes.rows[0]) {
        await client.query(
          `UPDATE orders SET status = 'COMPLETED', updated_at = NOW() WHERE tenant_id = $1 AND id = $2;`,
          [tenantId, fulRes.rows[0].order_id]
        );
      }
    }

    return shipment;
  });
};

module.exports = {
  createShipment,
  findShipmentById,
  listShipments,
  addTrackingEvent,
  updateShipmentStatus,
};

