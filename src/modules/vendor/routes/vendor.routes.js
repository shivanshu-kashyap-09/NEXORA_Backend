const express = require('express');
const router = express.Router();
const vendorController = require('../controller/vendor.controller');
const {
  createVendorSchema,
  queryVendorSchema,
  createPoSchema,
  queryPoSchema,
  receivePoSchema,
} = require('../validation/vendor.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all vendor endpoints
router.use(authGuard);

/**
 * @openapi
 * /vendors:
 *   post:
 *     summary: Register vendor or drop-shipping supplier
 *     description: Registers a 3rd-party vendor, external manufacturer, or drop-shipper with commission rates and contact info.
 *     tags:
 *       - Vendor Management & Purchase Orders
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
 *               - email
 *             properties:
 *               code:
 *                 type: string
 *                 example: VEND-ACME
 *               name:
 *                 type: string
 *                 example: Acme Manufacturing Corp
 *               email:
 *                 type: string
 *                 format: email
 *                 example: supply@acme.com
 *               phone:
 *                 type: string
 *                 example: "+14155552671"
 *               commission_percentage:
 *                 type: number
 *                 example: 12.5
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Vendor registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Vendor code already exists
 */
router.post(
  '/',
  rbacGuard({ roles: ['owner', 'admin', 'warehouse_manager'] }),
  validateRequest({ body: createVendorSchema }),
  vendorController.createVendor
);

/**
 * @openapi
 * /vendors:
 *   get:
 *     summary: List vendors
 *     description: Retrieve all vendors filtered by search query or active status.
 *     tags:
 *       - Vendor Management & Purchase Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
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
 *         description: Vendors retrieved successfully
 */
router.get(
  '/',
  validateRequest({ query: queryVendorSchema }),
  vendorController.listVendors
);

/**
 * @openapi
 * /vendors/{id}:
 *   get:
 *     summary: Get vendor details
 *     description: Retrieve full vendor information including purchase order volume.
 *     tags:
 *       - Vendor Management & Purchase Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Vendor UUID
 *     responses:
 *       200:
 *         description: Vendor details retrieved successfully
 *       404:
 *         description: Vendor not found
 */
router.get('/:id', vendorController.getVendor);

module.exports = router;

