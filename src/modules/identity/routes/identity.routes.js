const express = require('express');
const router = express.Router();
const identityController = require('../controller/identity.controller');
const { registerSchema, loginSchema, refreshTokenSchema } = require('../validation/identity.validation');
const validateRequest = require('../../../shared/validators/validateRequest');
const authGuard = require('../../../shared/middleware/authGuard');

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user account
 *     tags:
 *       - Authentication & Identity
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - first_name
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecretPassword123!
 *               first_name:
 *                 type: string
 *                 example: John
 *               last_name:
 *                 type: string
 *                 example: Doe
 *               phone:
 *                 type: string
 *                 example: "+919876543210"
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already registered
 */
router.post('/register', validateRequest({ body: registerSchema }), identityController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Authenticate with credentials and issue tokens
 *     tags:
 *       - Authentication & Identity
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@nexora.io
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Admin@Nexora2026
 *               tenant_slug:
 *                 type: string
 *                 example: demo-corp
 *     responses:
 *       200:
 *         description: Login successful, returns JWT access and refresh token
 *       401:
 *         description: Invalid email or password
 */
router.post('/login', validateRequest({ body: loginSchema }), identityController.login);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token using single-use rotation
 *     tags:
 *       - Authentication & Identity
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "40_byte_hex_refresh_token"
 *     responses:
 *       200:
 *         description: New access and refresh token pair issued
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post('/refresh', validateRequest({ body: refreshTokenSchema }), identityController.refreshToken);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Invalidate active refresh token session
 *     tags:
 *       - Authentication & Identity
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', identityController.logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get currently authenticated user profile
 *     tags:
 *       - Authentication & Identity
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authGuard, identityController.getProfile);

module.exports = router;
