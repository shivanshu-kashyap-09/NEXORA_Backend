const express = require('express');
const router = express.Router();
const tenantController = require('../controller/tenant.controller');
const {
  onboardTenantSchema,
  updateProfileSchema,
  updateConfigsSchema,
  inviteUserSchema,
} = require('../validation/tenant.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');
const rbacGuard = require('../../../shared/middleware/rbacGuard');

/**
 * @openapi
 * /tenants/onboard:
 *   post:
 *     summary: Onboard a new brand/organization (Tenant + Owner Account)
 *     description: Creates an isolated tenant, initializes quotas, profiles, configs, and provisions an owner account.
 *     tags:
 *       - Multi-Tenancy & Organizations
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - company_name
 *               - slug
 *               - primary_email
 *               - password
 *               - first_name
 *             properties:
 *               company_name:
 *                 type: string
 *                 example: Zara India
 *               slug:
 *                 type: string
 *                 example: zara-india
 *               primary_email:
 *                 type: string
 *                 format: email
 *                 example: ceo@zara.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecretPass123!
 *               first_name:
 *                 type: string
 *                 example: Amancio
 *               last_name:
 *                 type: string
 *                 example: Ortega
 *               primary_currency:
 *                 type: string
 *                 example: USD
 *               timezone:
 *                 type: string
 *                 example: Asia/Kolkata
 *               tier:
 *                 type: string
 *                 enum: [STARTER, GROWTH, ENTERPRISE, CUSTOM]
 *                 example: ENTERPRISE
 *     responses:
 *       201:
 *         description: Tenant successfully onboarded with owner credentials and tokens
 *       400:
 *         description: Validation error
 *       409:
 *         description: Tenant slug or email already exists
 */
router.post('/onboard', validateRequest({ body: onboardTenantSchema }), tenantController.onboard);

/**
 * @openapi
 * /tenants/current:
 *   get:
 *     summary: Get current active tenant organization details
 *     description: Retrieves organization profile, resource quotas, and business configurations.
 *     tags:
 *       - Multi-Tenancy & Organizations
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant organization details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tenant not found
 */
router.get('/current', authGuard, tenantController.getCurrent);

/**
 * @openapi
 * /tenants/current/profile:
 *   patch:
 *     summary: Update tenant branding & contact profile
 *     tags:
 *       - Multi-Tenancy & Organizations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               brand_color_primary:
 *                 type: string
 *                 example: "#0F172A"
 *               logo_url:
 *                 type: string
 *                 example: "https://cdn.brand.com/logo.png"
 *               support_email:
 *                 type: string
 *                 example: "support@zara.com"
 *               support_phone:
 *                 type: string
 *                 example: "+919876543210"
 *               custom_domain:
 *                 type: string
 *                 example: "oms.zara.com"
 *               tax_identifier:
 *                 type: string
 *                 example: "27AABCU9603R1ZM"
 *     responses:
 *       200:
 *         description: Tenant profile updated successfully
 *       403:
 *         description: Forbidden (Requires owner or admin role)
 */
router.patch(
  '/current/profile',
  authGuard,
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: updateProfileSchema }),
  tenantController.updateProfile
);

/**
 * @openapi
 * /tenants/current/configs:
 *   patch:
 *     summary: Update tenant operational business rules
 *     tags:
 *       - Multi-Tenancy & Organizations
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               soft_hold_duration_minutes:
 *                 type: integer
 *                 example: 15
 *               auto_capture_payment:
 *                 type: boolean
 *                 example: true
 *               auto_route_fulfillment:
 *                 type: boolean
 *                 example: true
 *               enable_cod:
 *                 type: boolean
 *                 example: false
 *               enable_bopis:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Tenant configurations updated successfully
 *       403:
 *         description: Forbidden (Requires owner role)
 */
router.patch(
  '/current/configs',
  authGuard,
  rbacGuard({ roles: ['owner'] }),
  validateRequest({ body: updateConfigsSchema }),
  tenantController.updateConfigs
);

/**
 * @openapi
 * /tenants/users/invite:
 *   post:
 *     summary: Invite a team member to the tenant organization
 *     tags:
 *       - Multi-Tenancy & Organizations
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
 *               - role_name
 *               - first_name
 *             properties:
 *               email:
 *                 type: string
 *                 example: "warehouse@zara.com"
 *               role_name:
 *                 type: string
 *                 enum: [admin, warehouse_manager, order_operator, support_agent, finance_manager]
 *                 example: "warehouse_manager"
 *               first_name:
 *                 type: string
 *                 example: "Rahul"
 *               last_name:
 *                 type: string
 *                 example: "Sharma"
 *     responses:
 *       201:
 *         description: Team member invited and role assigned
 *       403:
 *         description: Forbidden (Requires owner or admin role)
 */
router.post(
  '/users/invite',
  authGuard,
  rbacGuard({ roles: ['owner', 'admin'] }),
  validateRequest({ body: inviteUserSchema }),
  tenantController.inviteUser
);

/**
 * @openapi
 * /tenants/users:
 *   get:
 *     summary: List all team members within the tenant organization
 *     tags:
 *       - Multi-Tenancy & Organizations
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tenant users and roles
 *       401:
 *         description: Unauthorized
 */
router.get('/users', authGuard, tenantController.getUsers);

module.exports = router;

