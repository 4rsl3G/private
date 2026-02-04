const rateLimit = require("express-rate-limit");

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

const pollLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120, // long-poll, cukup tinggi tapi tetap ada batas
  standardHeaders: true,
  legacyHeaders: false
});

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { checkoutLimiter, pollLimiter, publicLimiter, adminLimiter };