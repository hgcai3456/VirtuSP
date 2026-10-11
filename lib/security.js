"use strict";

const crypto = require("node:crypto");

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

function headerHosts(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function allowedOriginList() {
  return String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function requestSecure(req) {
  if (req.socket?.encrypted) return true;
  if (!proxyTrusted(req)) return false;
  const proto = headerHosts(req.headers["x-forwarded-proto"])[0] || "";
  return proto === "https";
}

function proxyTrusted(req) {
  if (process.env.VIRTUSP_TRUST_PROXY !== "true") return false;
  const secret = process.env.VIRTUSP_EDGE_SECRET || "";
  const got = String(req.headers["x-virtusp-edge"] || "");
  if (!secret || got.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

function originAllowed(req, options = {}) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (allowedOriginList().includes(origin)) return true;
  const hostname = parsed.hostname.toLowerCase();
  const originPort =
    parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  const listenPort = String(options.listenPort || "");
  if (listenPort && LOOPBACK.has(hostname) && originPort === listenPort)
    return true;
  const forwarded = proxyTrusted(req)
    ? headerHosts(req.headers["x-forwarded-host"])
    : [];
  return [...headerHosts(req.headers.host), ...forwarded].some((name) => {
    const bare = name.replace(/:\d+$/, "");
    if (bare !== hostname) return false;
    const declared = name.includes(":")
      ? name.slice(name.lastIndexOf(":") + 1)
      : "";
    return !declared || declared === originPort;
  });
}

function redirectTarget(req) {
  if (process.env.VIRTUSP_REQUIRE_HTTPS !== "true") return "";
  if (requestSecure(req)) return "";
  const path = req.url || "/";
  const pathname = path.split("?")[0];
  if (
    pathname === "/api/live" ||
    pathname === "/api/ready" ||
    pathname === "/api/health"
  )
    return "";
  const host = String(req.headers.host || "");
  if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host)) return "";
  const name = host.replace(/:\d+$/, "").toLowerCase();
  const listed = allowedOriginList().some((item) => {
    try {
      return new URL(item).hostname.toLowerCase() === name;
    } catch {
      return false;
    }
  });
  if (!LOOPBACK.has(name) && !listed) return "";
  return "https://" + host + path;
}

function hstsValue(req) {
  if (process.env.VIRTUSP_HSTS !== "true" || !requestSecure(req)) return "";
  const host = String(req.headers.host || "")
    .replace(/:\d+$/, "")
    .toLowerCase();
  if (LOOPBACK.has(host)) return "";
  return "max-age=31536000; includeSubDomains";
}

function contentSecurityPolicy() {
  const connect = ["'self'", "blob:"];
  // LiveKit is used only when the optional avatar session is enabled.
  // The wildcard is limited to that provider's host, not a general source.
  if (process.env.AVATAR_ENABLED === "true") {
    connect.push("https://*.livekit.cloud", "wss://*.livekit.cloud");
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src " + connect.join(" "),
    "font-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function apply(req, res, options = {}) {
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": contentSecurityPolicy(),
    "Permissions-Policy":
      "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Permitted-Cross-Domain-Policies": "none",
  };
  const hsts = hstsValue(req);
  if (hsts) headers["Strict-Transport-Security"] = hsts;
  const origin = req.headers.origin;
  if (origin && originAllowed(req, options)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Methods"] =
      "GET, POST, PUT, PATCH, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Accept";
    headers.Vary = "Origin";
  }
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
}

function sessionTtlMs() {
  const ttl = Number(process.env.VIRTUSP_SESSION_TTL_MS || 12 * 60 * 60 * 1000);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 12 * 60 * 60 * 1000;
}

function sessionCurrent(session, now = Date.now()) {
  if (!session || !Number.isFinite(session.createdAt)) return false;
  return now - session.createdAt < sessionTtlMs();
}

function sessionCookie(value, req, options = {}) {
  const parts = [
    "virtusp_demo=" + (options.clear ? "" : value),
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    options.clear ? "Max-Age=0" : "Max-Age=" + Math.floor(sessionTtlMs() / 1000),
  ];
  if (requestSecure(req)) parts.push("Secure");
  return parts.join("; ");
}

const buckets = new Map();

function resetLimits() {
  buckets.clear();
}

function rateLimited(req, now = Date.now()) {
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  const path = String(req.url || "").split("?")[0];
  if (path === "/api/live" || path === "/api/ready" || path === "/api/health")
    return false;
  const limit = Number(process.env.VIRTUSP_RATE_LIMIT || 240);
  const max = Number.isFinite(limit) && limit > 0 ? limit : 240;
  const token = /(?:^|;\s*)virtusp_demo=([A-Za-z0-9-]+)/.exec(
    req.headers.cookie || "",
  )?.[1];
  let key = token ? "s:" + token : "";
  if (!key && proxyTrusted(req)) {
    const forwarded = String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim();
    if (forwarded) key = "f:" + forwarded.slice(0, 80);
  }
  if (!key) key = "i:" + String(req.socket?.remoteAddress || "local");
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= 60000) {
    buckets.set(key, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

function assertSafeJson(value, depth = 0) {
  if (!value || typeof value !== "object") return;
  if (depth > 8) {
    const error = new Error("Invalid JSON body.");
    error.status = 400;
    throw error;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeJson(item, depth + 1);
    return;
  }
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      const error = new Error("Invalid JSON body.");
      error.status = 400;
      throw error;
    }
    assertSafeJson(value[key], depth + 1);
  }
}

function publicError(error) {
  const status = Number(error?.status) || 400;
  const raw = String(error?.message || "Request failed.");
  const leaked =
    /[\r\n]\s*at\s+|node_modules|AWS_SECRET|AWS_ACCESS|API_KEY|BEGIN PRIVATE|BEGIN RSA/i.test(
      raw,
    );
  if (leaked) return { status: status >= 400 ? status : 500, error: "Request failed." };
  return { status, error: raw.slice(0, 300) };
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}

function cameraNote(error) {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError")
    return "Camera permission blocked";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "No camera is available";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "Camera is already in use";
  if (name === "AbortError") return "Camera request was dismissed";
  if (name === "SecurityError")
    return "Camera and microphone need a secure page";
  if (name === "OverconstrainedError") return "No compatible camera was found";
  return "Camera is unavailable";
}

function securePageMessage(pageUrl) {
  return (
    "Camera and microphone need a secure page. Open " +
    String(pageUrl || "https://localhost:3002/app.html")
  );
}

module.exports = {
  allowedOriginList,
  apply,
  assertSafeJson,
  cameraNote,
  contentSecurityPolicy,
  escapeHtml,
  headerHosts,
  hstsValue,
  originAllowed,
  proxyTrusted,
  publicError,
  rateLimited,
  redirectTarget,
  requestSecure,
  resetLimits,
  securePageMessage,
  sessionCookie,
  sessionCurrent,
  sessionTtlMs,
};
