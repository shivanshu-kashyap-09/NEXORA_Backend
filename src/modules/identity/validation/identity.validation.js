const { z } = require('zod');

// 1. Register Validation Schema
const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address format')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long'),
  first_name: z
    .string({ required_error: 'First name is required' })
    .min(2, 'First name must be at least 2 characters')
    .trim(),
  last_name: z
    .string()
    .trim()
    .optional(),
  phone: z
    .string()
    .trim()
    .optional(),
});

// 2. Login Validation Schema
const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address format')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password cannot be empty'),
});

// 3. Refresh Token Validation Schema
const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ required_error: 'Refresh token is required' })
    .min(1, 'Refresh token cannot be empty'),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
};
