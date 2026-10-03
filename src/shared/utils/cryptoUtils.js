const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Cryptographic & Hashing Utilities
 */
class CryptoUtils {
  /**
   * Hash a plaintext password using bcrypt
   */
  static async hashPassword(plainTextPassword, saltRounds = 12) {
    return await bcrypt.hash(plainTextPassword, saltRounds);
  }

  /**
   * Verify password against hash
   */
  static async comparePassword(plainTextPassword, hashedPassword) {
    return await bcrypt.compare(plainTextPassword, hashedPassword);
  }

  /**
   * Compute HMAC SHA-256 signature for webhook verification
   */
  static computeHmacSha256(payloadString, secret) {
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  /**
   * Constant-time comparison preventing timing attacks
   */
  static secureCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Generate secure random string
   */
  static randomString(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }
}

module.exports = CryptoUtils;
