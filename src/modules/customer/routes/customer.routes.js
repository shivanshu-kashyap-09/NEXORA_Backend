const express = require('express');
const router = express.Router();
const customerController = require('../controller/customer.controller');
const {
  createCustomerSchema,
  updateCustomerSchema,
  addAddressSchema,
  customerQuerySchema,
} = require('../validation/customer.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

// Require authentication for all customer endpoints
router.use(authGuard);

/**
 * @openapi
 * /customers:
 *   post:
 *     summary: Create a customer profile
 *     description: Registers a new customer profile under the authenticated tenant, with contact info and optional initial addresses.
 *     tags:
 *       - Customer Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane.doe@example.com
 *               first_name:
 *                 type: string
 *                 example: Jane
 *               last_name:
 *                 type: string
 *                 example: Doe
 *               phone:
 *                 type: string
 *                 example: "+1234567890"
 *               shipping_addresses:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - street
 *                     - city
 *                     - country
 *                     - postal_code
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: Home
 *                     street:
 *                       type: string
 *                       example: 742 Evergreen Terrace
 *                     city:
 *                       type: string
 *                       example: Springfield
 *                     state:
 *                       type: string
 *                       example: OR
 *                     country:
 *                       type: string
 *                       example: US
 *                     postal_code:
 *                       type: string
 *                       example: "97477"
 *                     phone:
 *                       type: string
 *                       example: "+1234567890"
 *                     is_default:
 *                       type: boolean
 *                       example: true
 *     responses:
 *       201:
 *         description: Customer profile created successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Customer email already exists for tenant
 */
router.post(
  '/',
  validateRequest({ body: createCustomerSchema }),
  customerController.createCustomer
);

/**
 * @openapi
 * /customers:
 *   get:
 *     summary: List customers with search and filters
 *     description: Retrieve a paginated list of customers with full-text search across email, name, and phone.
 *     tags:
 *       - Customer Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query matching email, name, or phone number
 *       - in: query
 *         name: is_blacklisted
 *         schema:
 *           type: boolean
 *         description: Filter blacklisted or regular customers
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
 *         description: Paginated customer list retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  validateRequest({ query: customerQuerySchema }),
  customerController.listCustomers
);

/**
 * @openapi
 * /customers/{id}:
 *   get:
 *     summary: Get customer details by ID
 *     description: Retrieve a single customer's complete profile and saved address book.
 *     tags:
 *       - Customer Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Customer UUID
 *     responses:
 *       200:
 *         description: Customer details retrieved successfully
 *       404:
 *         description: Customer not found
 */
router.get('/:id', customerController.getCustomer);

/**
 * @openapi
 * /customers/{id}:
 *   patch:
 *     summary: Update customer profile
 *     description: Modify customer contact details or blacklist status.
 *     tags:
 *       - Customer Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Customer UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: Jane
 *               last_name:
 *                 type: string
 *                 example: Smith
 *               phone:
 *                 type: string
 *                 example: "+1987654321"
 *               is_blacklisted:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Customer updated successfully
 *       404:
 *         description: Customer not found
 */
router.patch(
  '/:id',
  validateRequest({ body: updateCustomerSchema }),
  customerController.updateCustomer
);

/**
 * @openapi
 * /customers/{id}/addresses:
 *   post:
 *     summary: Add shipping address to customer address book
 *     description: Appends a new delivery address to the customer's saved address book.
 *     tags:
 *       - Customer Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Customer UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - street
 *               - city
 *               - country
 *               - postal_code
 *             properties:
 *               name:
 *                 type: string
 *                 example: Office
 *               street:
 *                 type: string
 *                 example: 100 Tech Blvd, Suite 400
 *               city:
 *                 type: string
 *                 example: Seattle
 *               state:
 *                 type: string
 *                 example: WA
 *               country:
 *                 type: string
 *                 example: US
 *               postal_code:
 *                 type: string
 *                 example: "98101"
 *               phone:
 *                 type: string
 *                 example: "+12065551234"
 *               is_default:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Address added successfully
 *       404:
 *         description: Customer not found
 */
router.post(
  '/:id/addresses',
  validateRequest({ body: addAddressSchema }),
  customerController.addShippingAddress
);

/**
 * @openapi
 * /customers/{id}/addresses/{addressId}:
 *   delete:
 *     summary: Delete shipping address from customer address book
 *     description: Removes a saved address from the customer's profile by address ID.
 *     tags:
 *       - Customer Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Customer UUID
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Address UUID
 *     responses:
 *       200:
 *         description: Address removed successfully
 *       404:
 *         description: Customer not found
 */
router.delete('/:id/addresses/:addressId', customerController.deleteShippingAddress);

module.exports = router;

