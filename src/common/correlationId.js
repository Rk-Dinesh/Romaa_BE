import { randomUUID } from "crypto";

// ── Correlation ID Middleware ─────────────────────────────────────────────────
//
// Attaches a unique correlation ID to every request for distributed tracing.
// Priority: x-correlation-id header > x-request-id header > auto-generated UUID.
// The ID is echoed back on the response via the x-correlation-id header so
// clients and API gateways can trace requests end-to-end.
//
// Usage:
//   req.correlationId — available in all downstream middleware / controllers
//   x-correlation-id  — set on every response header

export const correlationIdMiddleware = (req, res, next) => {
  const id =
    req.headers["x-correlation-id"] ||
    req.headers["x-request-id"] ||
    randomUUID();

  req.correlationId = id;
  res.setHeader("x-correlation-id", id);
  next();
};
