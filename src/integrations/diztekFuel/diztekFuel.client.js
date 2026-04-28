import logger from "../../config/logger.js";

// ── Config (env-driven) ───────────────────────────────────────────────────────
const BASE_URL    = process.env.FUEL_API_BASE_URL;
const USERNAME    = process.env.FUEL_API_USERNAME;
const PASSWORD    = process.env.FUEL_API_PASSWORD;
const PROJECT_ID  = process.env.FUEL_API_PROJECT_ID;
const REQUEST_TIMEOUT_MS = 15_000;

// ── In-memory token cache ─────────────────────────────────────────────────────
let cachedToken     = null;
let tokenFetchedAt  = 0;
// Provider doesn't document TTL — refresh proactively every 50 minutes.
const TOKEN_TTL_MS  = 50 * 60 * 1000;

function isTokenFresh() {
  return cachedToken && (Date.now() - tokenFetchedAt) < TOKEN_TTL_MS;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function assertConfig() {
  const missing = [];
  if (!BASE_URL)   missing.push("FUEL_API_BASE_URL");
  if (!USERNAME)   missing.push("FUEL_API_USERNAME");
  if (!PASSWORD)   missing.push("FUEL_API_PASSWORD");
  if (!PROJECT_ID) missing.push("FUEL_API_PROJECT_ID");
  if (missing.length) {
    throw new Error(`[diztekFuel] missing env vars: ${missing.join(", ")}`);
  }
}

async function generateAccessToken() {
  assertConfig();
  const url = `${BASE_URL}?token=generateAccessToken`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.result !== 1 || !json?.data?.token) {
    throw new Error(`Diztek auth failed: ${json?.message || res.status}`);
  }
  cachedToken    = json.data.token;
  tokenFetchedAt = Date.now();
  logger.info("[diztekFuel] auth token refreshed");
  return cachedToken;
}

async function getToken(forceRefresh = false) {
  if (!forceRefresh && isTokenFresh()) return cachedToken;
  return generateAccessToken();
}

/**
 * Fetch live fuel data for a single vehicle.
 * Auto-retries once on auth failure with a regenerated token.
 *
 * @param {Object} args
 * @param {String} args.plateNo - vehicle plate / serial number
 * @param {String} args.imei    - GPS device IMEI
 * @param {String} [args.projectId] - Diztek project_id; defaults to env
 * @returns {Promise<Array<Object>>} array of reading objects from the provider
 */
export async function getLiveFuelData({ plateNo, imei, projectId = PROJECT_ID }) {
  assertConfig();
  if (!plateNo || !imei) {
    throw new Error("plateNo and imei are required");
  }

  const callOnce = async (token) => {
    const url = `${BASE_URL}?token=getLiveFuelData`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "auth-code":    token,
      },
      body: JSON.stringify({
        project_id: String(projectId),
        plate_no:   plateNo,
        imei_no:    imei,
      }),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  };

  let token = await getToken(false);
  let { ok, status, json } = await callOnce(token);

  // Retry once with a fresh token if the server signals auth failure
  const looksLikeAuthFail = !ok || json?.result === 0 ||
    /token|auth|unauthor/i.test(String(json?.message || ""));
  if (looksLikeAuthFail) {
    logger.warn(`[diztekFuel] possible auth failure (status=${status}, msg=${json?.message}); refreshing token`);
    token = await getToken(true);
    ({ ok, status, json } = await callOnce(token));
  }

  if (!ok || json?.result !== 1) {
    throw new Error(`Diztek getLiveFuelData failed: status=${status} message=${json?.message || "unknown"}`);
  }
  return Array.isArray(json.data) ? json.data : [];
}

// Test/admin helper — exposed for the manual-sync endpoint
export async function _refreshTokenForTesting() {
  return generateAccessToken();
}
