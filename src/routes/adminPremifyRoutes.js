const express = require("express");
const requireAdmin = require("../middlewares/requireAdmin");
const { adminLimiter } = require("../middlewares/rateLimiters");
const { premifyGetBalance, premifyGetTransactions } = require("../services/premify");

module.exports = function adminPremifyRoutes({ AppSetting }) {
  const r = express.Router();

  r.get("/admin/premify/balance", requireAdmin, adminLimiter, async (req, res) => {
    const b = await premifyGetBalance(AppSetting);
    res.json({ success: true, data: b });
  });

  r.get("/admin/premify/transactions", requireAdmin, adminLimiter, async (req, res) => {
    const t = await premifyGetTransactions(AppSetting);
    res.json({ success: true, data: t });
  });

  return r;
};