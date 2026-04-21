import { createHash } from "crypto";

// Adds ETag header to GET responses for caching.
// Client sends If-None-Match header; if it matches, returns 304 Not Modified
// without re-sending the body — saves bandwidth on unchanged list responses.
//
// Only activates for:
//   - GET requests
//   - HTTP 200 responses
//   - Responses where body.status === true (successful API responses)
export const etagMiddleware = (req, res, next) => {
  if (req.method !== "GET") return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200 && body?.status === true) {
      const hash = createHash("md5")
        .update(JSON.stringify(body))
        .digest("hex");
      const etag = `"${hash}"`;
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, no-cache"); // must revalidate

      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch === etag) {
        res.statusCode = 304;
        return res.end();
      }
    }
    return originalJson(body);
  };
  next();
};
