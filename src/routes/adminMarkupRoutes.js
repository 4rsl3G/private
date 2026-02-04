const express = require("express");
const requireAdmin = require("../middlewares/requireAdmin");
const { adminLimiter } = require("../middlewares/rateLimiters");

module.exports = function adminMarkupRoutes({ MarkupRule }) {
  const r = express.Router();

  r.get("/admin/markup", requireAdmin, adminLimiter, async (req, res) => {
    const rows = await MarkupRule.findAll({ order: [["updatedAt", "DESC"]] });
    res.json({ success: true, data: rows });
  });

  r.post("/admin/markup/set", requireAdmin, adminLimiter, async (req, res) => {
    const { variantId, type = "FIXED", value = 0, isActive = true } = req.body || {};
    if (!variantId) return res.status(400).json({ error: "variantId required" });

    await MarkupRule.upsert({ variantId, type, value, isActive });
    res.json({ success: true });
  });

  r.delete("/admin/markup/:variantId", requireAdmin, adminLimiter, async (req, res) => {
    await MarkupRule.destroy({ where: { variantId: req.params.variantId } });
    res.json({ success: true });
  });

  return r;
};