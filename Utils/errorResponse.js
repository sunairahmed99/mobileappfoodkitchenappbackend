/**
 * Central error mapping for controllers and the global Express error handler.
 *
 * Goals:
 *  - client-caused problems (bad ObjectId, schema validation, duplicate key)
 *    become 4xx responses instead of generic 500s;
 *  - internal details (driver text, stack traces, `x is not a function`) are
 *    never echoed to the client.
 */

export const mapError = (error) => {
  if (!error) {
    return { status: 500, message: 'Internal Server Error' };
  }

  if (error.name === 'CastError') {
    return { status: 400, message: 'Invalid id format' };
  }

  if (error.name === 'ValidationError') {
    const firstError = error.errors ? Object.values(error.errors)[0] : null;
    return {
      status: 400,
      message: (firstError && firstError.message) || 'Validation failed',
    };
  }

  if (error.code === 11000) {
    return { status: 409, message: 'A record with these details already exists' };
  }

  const explicitStatus = error.status || error.statusCode;
  if (Number.isInteger(explicitStatus) && explicitStatus >= 400 && explicitStatus < 500) {
    return { status: explicitStatus, message: error.message || 'Bad Request' };
  }

  return { status: 500, message: 'Internal Server Error' };
};

/**
 * Convenience wrapper for controller catch blocks.
 * 4xx responses get their specific mapped message, 5xx responses get the
 * controller-specific generic message (the real error is only logged).
 */
export const handleControllerError = (res, error, fallbackMessage) => {
  const { status, message } = mapError(error);

  if (status >= 500) {
    console.error('[API Error]', (error && error.name) || 'Error', '-', (error && error.message) || 'unknown');
    return res.status(500).json({ success: false, message: fallbackMessage });
  }

  return res.status(status).json({ success: false, message });
};

export default handleControllerError;
