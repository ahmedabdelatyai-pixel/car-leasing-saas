import { Request, Response, NextFunction } from 'express';

/**
 * Global Express Error Handling Middleware.
 */
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('[SERVER_ERROR]:', err);

  const status = err.status || 500;
  const message = err.message || 'An unexpected internal server error occurred.';

  return res.status(status).json({
    error: 'InternalServerError',
    message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
};
