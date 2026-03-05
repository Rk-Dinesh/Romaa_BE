// Simple in-memory rate limiter — no extra dependencies, Express v5 compatible.
// Uses a Map keyed by IP. Entries auto-reset after the window expires.

const store = new Map();

export function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10, message = "Too many requests, please try again later." } = {}) {
  return (req, res, next) => {
    const key = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const now = Date.now();
    const record = store.get(key);

    if (!record || now > record.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    record.count++;
    if (record.count > max) {
      return res.status(429).json({ status: false, message });
    }

    next();
  };
}
