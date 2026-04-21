import { AsyncLocalStorage } from "async_hooks";

export const requestContext = new AsyncLocalStorage();

// Middleware — must be registered AFTER correlationIdMiddleware
export const requestContextMiddleware = (req, res, next) => {
  requestContext.run(
    {
      correlationId: req.correlationId,
      userId:        req.user?._id,
      ipAddress:     req.ip,
    },
    next
  );
};

// Helper — call anywhere (services, utils) without passing context manually
export const getContext = () => requestContext.getStore() ?? {};
