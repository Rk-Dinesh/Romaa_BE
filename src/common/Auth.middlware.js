import jwt from "jsonwebtoken";
import EmployeeModel from "../module/hr/employee/employee.model.js";


// --- 1. Authentication Middleware (Who are you?) ---
export const verifyJWT = async (req, res, next) => {
  try {
    // Get token from Cookie OR Header (Bearer token)
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ status: false, message: "Unauthorized request" });
    }

    // Verify Token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Find User & Populate Role (Crucial for RBAC)
    const user = await EmployeeModel.findById(decodedToken._id)
      .select("-password -refreshToken") // Exclude sensitive fields
      .populate("role"); // We need the role permissions attached to req.user

    if (!user) {
      return res.status(401).json({ status: false, message: "Invalid Access Token" });
    }

    // Attach user to request object
    req.user = user;
    next();
    
  } catch (error) {
    return res.status(401).json({ status: false, message: error.message || "Invalid Access Token" });
  }
};

// --- 2. Authorization Middleware (Are you allowed to do this?) ---
// Usage: verifyPermission('tender', 'tenders', 'create')
//        verifyPermission('dashboard', null, 'read')   // simple module
//
// Delegates to RoleSchema.methods.can() — see role.model.js. Keeping the
// authorization logic in one place ensures middleware, crons, and any other
// caller all answer "can this role do X?" the same way.
export const verifyPermission = (module, subModule, action = "read") => {
  return (req, res, next) => {
    try {
      const role = req.user?.role;
      if (!role) {
        return res.status(403).json({ status: false, message: "Access Denied: No Role Assigned" });
      }

      // role is populated by verifyJWT, so .can() is on the Mongoose document.
      // Defensive fallback: if someone calls this without populate(), check raw.
      const ok =
        typeof role.can === "function"
          ? role.can(module, subModule, action)
          : !!(subModule
              ? role.permissions?.[module]?.[subModule]?.[action]
              : role.permissions?.[module]?.[action]);

      if (!ok) {
        return res.status(403).json({
          status: false,
          message: `Access Denied: You do not have '${action}' permission for ${module}/${subModule || ""}`,
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ status: false, message: "Authorization Error" });
    }
  };
};

// ── AI Safety: forbidden keywords (data exfiltration probes) ─────────────────
const FORBIDDEN_KEYWORDS = [
  "password", "credential", "credit card", "secret_key", "auth_token",
  "refreshtoken", "accesstoken", "jwt", "api_key", "apikey", "private_key",
  "mongodb uri", "mongo_uri", "database url", "connection string",
  "aws_secret", "aws_access", "gemini_api", "firebase", "service account",
  "env file", "dotenv", ".env", "process.env",
  "aadhar", "aadhaar", "pan number", "bank account number",
];

// ── AI Safety: prompt injection & jailbreak patterns ─────────────────────────
const INJECTION_PATTERNS = [
  // Classic jailbreaks
  "ignore previous instructions",
  "ignore all instructions",
  "ignore your instructions",
  "disregard previous",
  "disregard all",
  "forget your instructions",
  "override instructions",
  "bypass instructions",
  "jailbreak",
  "developer mode",
  "dan mode",
  "unrestricted mode",
  "god mode",
  // Role confusion attacks
  "you are now",
  "act as",
  "pretend you are",
  "pretend to be",
  "roleplay as",
  "simulate a",
  "you are a different",
  "your new role",
  "from now on you",
  // System prompt attacks
  "system prompt",
  "system message",
  "initial prompt",
  "reveal your prompt",
  "show your prompt",
  "print your instructions",
  "what are your instructions",
  "repeat everything above",
  "repeat the above",
  "output your instructions",
  // Data exfiltration via AI relay
  "send this to",
  "relay this to",
  "transmit the following",
  "forward the data",
  "export all records",
  "dump the database",
  "list all passwords",
  "show all users",
  // Encoding bypass attempts
  "base64",
  "hex encode",
  "rot13",
  "url encode",
];

// ── Detect suspicious repeated characters (padding/overflow attacks) ──────────
function hasSuspiciousRepetition(prompt) {
  // More than 50 of the same character consecutively
  return /(.)\1{50,}/.test(prompt);
}

// ── Detect potential encoded injection (e.g. base64 blobs in prompt) ─────────
function hasEncodedPayload(prompt) {
  // Long base64-looking strings (> 100 chars of base64 charset)
  return /[A-Za-z0-9+/]{100,}={0,2}/.test(prompt);
}

export const aiSafetyMiddleware = (req, res, next) => {
  const rawPrompt = req.body?.prompt;

  if (!rawPrompt || typeof rawPrompt !== "string") {
    return res.status(400).json({ status: false, message: "No prompt provided." });
  }

  // Normalise: trim whitespace, collapse multiple spaces
  const prompt = rawPrompt.trim().replace(/\s+/g, " ");
  req.body.prompt = prompt; // write back the cleaned prompt

  if (prompt.length === 0) {
    return res.status(400).json({ status: false, message: "Prompt cannot be empty." });
  }

  const lowerPrompt = prompt.toLowerCase();

  // 1. Block sensitive data probing
  const foundSensitive = FORBIDDEN_KEYWORDS.find((word) => lowerPrompt.includes(word));
  if (foundSensitive) {
    return res.status(403).json({
      status: false,
      message: "Security Alert: Your query contains restricted keywords.",
    });
  }

  // 2. Block prompt injection / jailbreak attempts
  const foundInjection = INJECTION_PATTERNS.find((pattern) => lowerPrompt.includes(pattern));
  if (foundInjection) {
    return res.status(403).json({
      status: false,
      message: "Security Alert: Unauthorized command pattern detected.",
    });
  }

  // 3. Block suspicious character repetition
  if (hasSuspiciousRepetition(prompt)) {
    return res.status(400).json({
      status: false,
      message: "Invalid prompt format.",
    });
  }

  // 4. Block potential base64-encoded payloads
  if (hasEncodedPayload(prompt)) {
    return res.status(400).json({
      status: false,
      message: "Invalid prompt format.",
    });
  }

  next();
};