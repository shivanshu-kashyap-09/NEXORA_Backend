const express = require('express');
const router = express.Router();
const warehouseController = require('../controller/warehouse.controller');
const {
  createWarehouseSchema,
  updateWarehouseSchema,
} = require('../validation/warehouse.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all warehouse routes
router.use(authGuard);

/**
 * @openapi
 * /warehouses:
 *   post:
 *     summary: Create a warehouse fulfillment node
 *     description: Registers a new distribution center or retail store node with fulfillment priority and physical address.
 *     tags:
 *       - Warehouse & Fulfillment Nodes
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *               - address
 *             properties:
 *               code:
 *                 type: string
 *                 example: WH-BLR-01
 *                 description: Unique warehouse node code for the tenant (uppercase)
 *               name:
 *                 type: string
 *                 example: Bengaluru Central Fulfillment Hub
 *                 description: Human-readable name of the facility
 *               is_retail_store:
 *                 type: boolean
 *                 default: false
 *                 example: false
 *                 description: Flag indicating if this facility also serves as a walk-in retail store (BOPIS/BORIS)
 *               priority:
 *                 type: integer
 *                 default: 1
 *                 example: 1
 *                 description: Order routing priority (lower number = higher routing priority)
 *               address:
 *                 type: object
 *                 required:
 *                   - city
 *                   - country
 *                   - postal_code
 *                 properties:
 *                   street:
 *                     type: string
 *                     example: Plot 42, Electronic City Phase 1
 *                   city:
 *                     type: string
 *                     example: Bengaluru
 *                   state:
 *                     type: string
 *                     example: Karnataka
 *                   country:
 *                     type: string
 *                     example: IN
 *                   postal_code:
 *                     type: string
 *                     example: "560100"
 *     responses:
 *       201:
 *         description: Warehouse node created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden - requires owner or admin role
 *       409:
 *         description: Warehouse code already exists for tenant
 */
router.post(
  '/',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: createWarehouseSchema }),
  warehouseController.createWarehouse
);

/**
 * @openapi
 * /warehouses:
 *   get:
 *     summary: List all warehouse fulfillment nodes
 *     description: Retrieve all warehouses and retail nodes for the current tenant ordered by routing priority.
 *     tags:
 *       - Warehouse & Fulfillment Nodes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter active or inactive fulfillment centers
 *     responses:
 *       200:
 *         description: Warehouses retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/', warehouseController.listWarehouses);

/**
 * @openapi
 * /warehouses/{id}:
 *   get:
 *     summary: Get warehouse node details
 *     description: Fetches facility details, operational status, and address by warehouse ID.
 *     tags:
 *       - Warehouse & Fulfillment Nodes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Warehouse facility UUID
 *     responses:
 *       200:
 *         description: Warehouse details retrieved successfully
 *       404:
 *         description: Warehouse node not found
 */
router.get('/:id', warehouseController.getWarehouse);

/**
 * @openapi
 * /warehouses/{id}:
 *   patch:
 *     summary: Update warehouse node
 *     description: Update warehouse details, routing priority, active state, or facility address.
 *     tags:
 *       - Warehouse & Fulfillment Nodes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Warehouse facility UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Bengaluru Central Megahub
 *               is_retail_store:
 *                 type: boolean
 *                 example: false
 *               priority:
 *                 type: integer
 *                 example: 2
 *               is_active:
 *                 type: boolean
 *                 example: true
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   country:
 *                     type: string
 *                   postal_code:
 *                     type: string
 *     responses:
 *       200:
 *         description: Warehouse updated successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Forbidden - requires owner or admin role
 *       404:
 *         description: Warehouse not found
 */
router.patch(
  '/:id',
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: updateWarehouseSchema }),
  warehouseController.updateWarehouse
);

module.exports = router;

