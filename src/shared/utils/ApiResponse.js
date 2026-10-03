/**
 * Standard API Response Builder for NEXORA Engine
 */
class ApiResponse {
  /**
   * Success Response (200, 201, etc.)
   */
  static success(res, data = {}, message = 'Operation successful', statusCode = 200, meta = null) {
    const correlationId = reqCorrelationId(res);
    const responsePayload = {
      success: true,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    if (meta) {
      responsePayload.meta = meta;
    }

    return res.status(statusCode).json(responsePayload);
  }

  /**
   * Created Response (201 Created)
   */
  static created(res, data = {}, message = 'Resource created successfully') {
    return ApiResponse.success(res, data, message, 201);
  }

  /**
   * Paginated Response Helper
   */
  static paginated(res, items = [], page = 1, limit = 20, total = 0, message = 'Data retrieved successfully') {
    const totalPages = Math.ceil(total / limit) || 1;
    const meta = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total: parseInt(total, 10),
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
    return ApiResponse.success(res, items, message, 200, meta);
  }
}

function reqCorrelationId(res) {
  if (res?.req?.correlationId) return res.req.correlationId;
  if (res?.getHeader && res.getHeader('X-Correlation-ID')) return res.getHeader('X-Correlation-ID');
  return undefined;
}

module.exports = ApiResponse;
