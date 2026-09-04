/**
 * Global error handler — must be the last middleware added to Express.
 */
export function errorHandler(err, req, res, next) {
  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 500MB.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files. Maximum 5 files per job.' });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation failed', details: err.message });
  }

  // MongoDB duplicate key
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate entry', details: err.message });
  }

  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  if (status === 500) {
    console.error('[ErrorHandler]', err);
  }

  res.status(status).json({
    error:   message,
    ...(err.code ? { code: err.code } : {}),
    ...(err.payload || {}),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export default errorHandler;
