const express = require('express');
const router = express.Router();
const auditController = require('../controller/audit.controller');
const {
  createAuditSchema,
  queryAuditSchema,
} = require('../validation/audit.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all audit log endpoints
router.use(authGuard);

/**
 * @openapi
 * /audit-logs:
 *   post:
 *     summary: Ingest immutable audit log entry
 *     description: Records a security, administrative, or state mutation event in the tenant audit trail.
 *     tags:
 *       - Comprehensive Audit Logging & Security Compliance
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - resource_type
 *               - resource_id
 *             properties:
 *               actor_id:
 *                 type: string
 *                 format: uuid
 *               actor_type:
 *                 type: string
 *                 enum: [USER, API_KEY, SYSTEM, CRON]
 *                 default: USER
 *               action:
 *                 type: string
 *                 example: STATUS_CHANGE
 *               resource_type:
 *                 type: string
 *                 example: ORDER
 *               resource_id:
 *                 type: string
 *                 example: ord_9823481
 *               diff_payload:
 *                 type: object
 *                 example: { "previous": "PENDING", "new": "CONFIRMED" }
 *               correlation_id:
 *                 type: string
 *                 example: req_823481239
 *     responses:
 *       201:
 *         description: Audit log created successfully
 *       400:
 *         description: Validation error
 */
router.post(
  '/',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: createAuditSchema }),
  auditController.createAuditLog
);

/**
 * @openapi
 * /audit-logs:
 *   get:
 *     summary: Query audit trail
 *     description: Retrieve audit logs with date-range, actor, resource type, and action filters.
 *     tags:
 *       - Comprehensive Audit Logging & Security Compliance
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: resource_type
 *         schema:
 *           type: string
 *           example: ORDER
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           example: STATUS_CHANGE
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 */
router.get(
  '/',
  validateRequest({ query: queryAuditSchema }),
  auditController.listAuditLogs
);

/**
 * @openapi
 * /audit-logs/resource/{resource_type}/{resource_id}:
 *   get:
 *     summary: Get resource audit timeline
 *     description: Retrieve complete historical diff timeline for a specific entity (e.g. order, inventory, customer).
 *     tags:
 *       - Comprehensive Audit Logging & Security Compliance
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resource_type
 *         required: true
 *         schema:
 *           type: string
 *           example: ORDER
 *       - in: path
 *         name: resource_id
 *         required: true
 *         schema:
 *           type: string
 *           example: ord_12345
 *     responses:
 *       200:
 *         description: Resource audit timeline retrieved successfully
 */
router.get(
  '/resource/:resource_type/:resource_id',
  auditController.getResourceTimeline
);

/**
 * @openapi
 * /audit-logs/{id}:
 *   get:
 *     summary: Get audit log details
 *     description: Retrieve single audit record with full IP, User Agent, and diff payload.
 *     tags:
 *       - Comprehensive Audit Logging & Security Compliance
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Audit log details retrieved successfully
 *       404:
 *         description: Audit log not found
 */
router.get('/:id', auditController.getAuditLog);

module.exports = router;
