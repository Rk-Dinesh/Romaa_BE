import { AsyncLocalStorage } from "async_hooks";

export const requestContext = new AsyncLocalStorage();

// Middleware — must be registered AFTER correlationIdMiddleware.
// userId / userName / tenantId are filled in by verifyJWT once the user is
// resolved; the store object is the same reference, so mutations propagate
// to any downstream getContext() caller within the request.
export const requestContextMiddleware = (req, res, next) => {
  requestContext.run(
    {
      correlationId: req.correlationId,
      userId:        null,
      userName:      "",
      ipAddress:     req.ip,
      tenantId:      "",
    },
    next
  );
};

// Helper — call anywhere (services, utils) without passing context manually
export const getContext = () => requestContext.getStore() ?? {};

// Run a function inside a synthetic context for non-HTTP work (crons, seed,
// queue workers). Audit logs written from within `fn` will be tagged with the
// supplied label as `actor_name`, e.g. "system:absenteeism".
export const runAsSystem = (name, fn) => {
  return requestContext.run(
    {
      correlationId: `system:${name}:${Date.now()}`,
      userId:        null,
      userName:      `system:${name}`,
      ipAddress:     "system",
      tenantId:      "",
    },
    fn
  );
};
