const rateLimit = require("express-rate-limit");

/**
 * Ambil IP client dengan aman
 * Prioritas:
 * 1. Cloudflare (cf-connecting-ip)
 * 2. X-Forwarded-For (paling kiri)
 * 3. req.ip fallback
 */
function getClientIp(req) {
  const cf = req.headers["cf-connecting-ip"];
  if (cf && typeof cf === "string") return cf.trim();

  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) {
    return xf.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "0.0.0.0";
}

/**
 * Base limiter config (shared)
 * - trust proxy SUDAH diset di server.js -> app.set("trust proxy", 1)
 * - keyGenerator custom => tidak kena ERR_ERL_*
 */
function makeLimiter({ windowMs, limit, prefix }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${prefix}:${getClientIp(req)}`,
  });
}

/**
 * 🔐 Checkout
 * - rawan spam klik
 * - dibuat ketat
 */
const checkoutLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 10, // ⛔ jangan kebesaran (anti double order)
  prefix: "checkout",
});

/**
 * 🔄 Polling status (long poll)
 * - limit lebih besar tapi tetap aman
 */
const pollLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  prefix: "poll",
});

/**
 * 🌍 Public API (products, invoice public, qris png)
 */
const publicLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 300,
  prefix: "public",
});

/**
 * 👮 Admin API
 * - lebih ketat karena sensitif
 */
const adminLimiter = makeLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  prefix: "admin",
});

module.exports = {
  checkoutLimiter,
  pollLimiter,
  publicLimiter,
  adminLimiter,
};
