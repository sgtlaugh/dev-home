import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

export function logError(operation: string, error: any, context: Record<string, any> = {}): void {
  const message = error?.response?.data?.message || error?.message || String(error);
  const status = error?.response?.status || "unknown";
  logger.error(operation, `Status ${status}: ${message}`, context);
}

/**
 * Express error-handling middleware.
 * Used with express-async-errors so routes can just throw
 * instead of wrapping everything in try/catch.
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const status = err.response?.status || 500;
  const internalMessage = err.response?.data ? JSON.stringify(err.response.data) : err.message;
  const stack = err.stack ? err.stack.split("\n").slice(0, 3).join(" → ") : "";

  logger.error(
    `${req.method} ${req.path}`,
    `Error ${status}: ${internalMessage}${stack ? ` ${stack}` : ""}`,
  );

  // For 5xx errors, return a generic message to avoid leaking internal details
  const clientMessage =
    status >= 500
      ? "An internal server error occurred"
      : err.response?.data?.message || err.message || "Request failed";
  res.status(status).json({ error: clientMessage });
}
