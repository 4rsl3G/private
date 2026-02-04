const express = require("express");
const requireAdmin = require("../middlewares/requireAdmin");
const { adminLimiter } = require("../middlewares/rateLimiters");
const { KEYS, getSetting, setSetting } = require("../services/settings");

module.exports = function adminSettingsRoutes({ AppSetting }) {
  const r = express.Router();

  r.get("/admin/settings", requireAdmin, adminLimiter, async (req, res) => {
    const keys = Object.values(KEYS);
    const out = {};
    for (const k of keys) out[k] = await getSetting(AppSetting, k, null);
    res.json({ success: true, data: out });
  });

  r.post("/admin/settings/set", requireAdmin, adminLimiter, async (req, res) => {
    const { key, value } = req.body || {};
    if (!key) return res.status(400).json({ error: "key required" });
    await setSetting(AppSetting, key, value ?? "", Number(req.admin.sub));
    res.json({ success: true });
  });

  return r;
};