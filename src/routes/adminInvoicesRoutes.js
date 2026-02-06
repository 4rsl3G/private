const express = require("express");
const { Op } = require("sequelize");
const requireAdmin = require("../middlewares/requireAdmin");
const { adminLimiter } = require("../middlewares/rateLimiters");
const { premifyCreateOrder, premifyGetTransactions } = require("../services/premify");

module.exports = function adminInvoicesRoutes({ sequelize, Invoice, AppSetting, eventBus }) {
  const r = express.Router();

  r.get("/admin/invoices", requireAdmin, adminLimiter, async (req, res) => {
    const status = req.query.status || null;
    const q = (req.query.q || "").trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (q) {
      where[Op.or] = [
        { invoiceId: { [Op.like]: `%${q}%` } },
        { productName: { [Op.like]: `%${q}%` } },
        { variantName: { [Op.like]: `%${q}%` } },
        { premifyOrderId: { [Op.like]: `%${q}%` } }
      ];
    }

    const { rows, count } = await Invoice.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset
    });

    res.json({ success: true, data: rows, meta: { page, limit, total: count, totalPages: Math.ceil(count / limit) } });
  });

  r.get("/admin/invoices/:invoiceId", requireAdmin, adminLimiter, async (req, res) => {
    const inv = await Invoice.findOne({ where: { invoiceId: req.params.invoiceId } });
    if (!inv) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });
    res.json({ success: true, data: inv });
  });

  r.post("/admin/invoices/:invoiceId/expire", requireAdmin, adminLimiter, async (req, res) => {
    const inv = await Invoice.findOne({ where: { invoiceId: req.params.invoiceId } });
    if (!inv) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });
    if (inv.status === "FULFILLED") return res.status(400).json({ error: "CANNOT_EXPIRE_FULFILLED" });
    await inv.update({ status: "EXPIRED" });
    eventBus.emit("invoice:update", { invoiceId: inv.invoiceId, status: "EXPIRED", source: "admin" });
    res.json({ success: true });
  });

r.post("/admin/invoices/:invoiceId/retry-fulfill", requireAdmin, adminLimiter, async (req, res) => {
  const invoiceId = req.params.invoiceId;

  try {
    const result = await sequelize.transaction(async (t) => {
      const inv = await Invoice.findOne({
        where: { invoiceId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!inv) return { ok: false, code: "INVOICE_NOT_FOUND" };

      // ✅ kalau sudah pernah punya premifyOrderId, JANGAN bikin order lagi
      // Ini bikin endpoint jadi idempotent.
      if (inv.premifyOrderId) {
        // optional: coba refetch receipt sekalian
        let receipt = null;
        try {
          const list = await premifyGetTransactions(AppSetting);
          receipt = list.find((x) => x.order_id === inv.premifyOrderId) || null;
        } catch {}

        if (receipt) {
          await inv.update(
            { premifyReceiptJson: JSON.stringify(receipt) },
            { transaction: t }
          );
        }

        return {
          ok: true,
          status: inv.status,
          premifyOrderId: inv.premifyOrderId,
          reused: true,
          receipt: receipt || null,
        };
      }

      // ✅ hanya boleh retry kalau status PAID atau FAILED
      if (inv.status !== "PAID" && inv.status !== "FAILED") {
        return { ok: false, code: "INVOICE_NOT_PAID_OR_FAILED", status: inv.status };
      }

      // ✅ bikin order sekali saja
      const prem = await premifyCreateOrder(AppSetting, {
        variantId: inv.variantId,
        quantity: inv.quantity || 1,
        voucherCode: inv.voucherCode || undefined,
        emailInvite: inv.emailInvite || undefined,
      });

      // receipt optional
      let receipt = null;
      try {
        const list = await premifyGetTransactions(AppSetting);
        receipt = list.find((x) => x.order_id === prem.order_id) || null;
      } catch {}

      await inv.update(
        {
          status: "FULFILLED",
          premifyOrderId: prem.order_id,
          premifyReceiptJson: receipt ? JSON.stringify(receipt) : null,
        },
        { transaction: t }
      );

      return { ok: true, status: "FULFILLED", premifyOrderId: prem.order_id, reused: false, receipt };
    });

    if (!result.ok) return res.status(400).json({ error: result.code, status: result.status });

    eventBus.emit("invoice:update", {
      invoiceId,
      status: result.status,
      premifyOrderId: result.premifyOrderId,
      source: result.reused ? "admin-retry-reuse" : "admin-retry-new",
    });

    return res.json({ success: true, data: result });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

  // Refetch receipt dari /transactions (kalau telat muncul)
  r.post("/admin/invoices/:invoiceId/refetch-receipt", requireAdmin, adminLimiter, async (req, res) => {
    const invoiceId = req.params.invoiceId;

    const inv = await Invoice.findOne({ where: { invoiceId } });
    if (!inv) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });
    if (!inv.premifyOrderId) return res.status(400).json({ error: "NO_PREMIFY_ORDER" });

    const list = await premifyGetTransactions(AppSetting);
    const receipt = list.find(x => x.order_id === inv.premifyOrderId) || null;

    await inv.update({ premifyReceiptJson: receipt ? JSON.stringify(receipt) : null });
    res.json({ success: true, data: receipt });
  });

  return r;
};
