const express = require("express");
const { Op } = require("sequelize");
const requireAdmin = require("../middlewares/requireAdmin");
const { adminLimiter } = require("../middlewares/rateLimiters");
const { premifyGetBalance } = require("../services/premify");

module.exports = function adminDashboardRoutes({ Invoice, AppSetting }) {
  const r = express.Router();

  r.get("/admin/dashboard/summary", requireAdmin, adminLimiter, async (req, res) => {
    const weekStart = new Date(Date.now() - 7 * 864e5);

    const counts = {
      pending: await Invoice.count({ where: { status: "PENDING" } }),
      paid: await Invoice.count({ where: { status: "PAID" } }),
      fulfilled: await Invoice.count({ where: { status: "FULFILLED" } }),
      expired: await Invoice.count({ where: { status: "EXPIRED" } }),
      failed: await Invoice.count({ where: { status: "FAILED" } })
    };

    const rows7d = await Invoice.findAll({
      where: { createdAt: { [Op.gte]: weekStart }, status: { [Op.in]: ["PAID", "FULFILLED"] } },
      attributes: ["payAmount", "profit"],
      raw: true
    });

    let omzet7d = 0, profit7d = 0;
    for (const x of rows7d) { omzet7d += Number(x.payAmount || 0); profit7d += Number(x.profit || 0); }

    const recent = await Invoice.findAll({
      order: [["createdAt", "DESC"]],
      limit: 10,
      attributes: ["invoiceId","status","payAmount","productName","variantName","createdAt","expiresAt","paidAt","premifyOrderId"],
      raw: true
    });

    let premifyBalance = null;
    try { premifyBalance = await premifyGetBalance(AppSetting); }
    catch (e) { premifyBalance = { error: e.message || "PREMIFY_BALANCE_FAILED" }; }

    res.json({
      success: true,
      data: {
        premifyBalance,
        counts,
        totals: { last7d: { omzet: omzet7d, profit: profit7d } },
        recent,
        serverTime: new Date().toISOString()
      }
    });
  });

  return r;
};