// Idempotency: if the client sends an X-Idempotency-Key header on a POST request,
// cache the response for 24 hours and return the cached response on duplicate requests.
// Prevents duplicate bills/vouchers on network retries.
//
// In-memory cache is intentional for now (Redis is phase 2).
// Cache key is scoped per user so different users can use the same idempotency key.

const cache = new Map();

export const idempotencyMiddleware = (req, res, next) => {
  if (req.method !== "POST") return next();

  const key = req.headers["x-idempotency-key"];
  if (!key) return next(); // optional header — skip if not provided

  const cacheKey = `${req.user?._id || "anon"}:${key}`;

  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    return res.status(cached.status).json(cached.body);
  }

  // Intercept response to cache the first successful response
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400) {
      cache.set(cacheKey, { status: res.statusCode, body });
      // Auto-expire after 24 hours
      setTimeout(() => cache.delete(cacheKey), 24 * 60 * 60 * 1000);
    }
    return originalJson(body);
  };

  next();
};
