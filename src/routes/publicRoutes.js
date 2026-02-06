const express = require("express");
const { Op } = require("sequelize");
const QRCode = require("qrcode");

const {
  premifyGetProducts,
  premifyCreateOrder,
  premifyGetTransactions,
} = require("../services/premify");

const { KEYS, getSetting } = require("../services/settings");
const { makeDynamicQris } = require("../utils/qris");
const { applyMarkup, generateUniqueSafe } = require("../services/checkout");
const { getMutasi } = require("../services/gobiz");
const { makeInvoiceId, makePublicToken } = require("../utils/id");
const {
  checkoutLimiter,
  pollLimiter,
  publicLimiter,
} = require("../middlewares/rateLimiters");

/* =========================
   Helpers
   ========================= */

function getClientIp(req) {
  // since app.set("trust proxy", 1) in server.js, req.ip is good
  // fallback in case of local usage
  return req.ip || req.socket?.remoteAddress || null;
}

function nowYmdJakartaApprox() {
  // cukup untuk harian (Gobiz mutasi biasanya harian)
  return new Date().toISOString().slice(0, 10);
}

function isInviteType(vType) {
  const s = String(vType || "").toLowerCase();
  return s.includes("invite");
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function prettifyKey(k) {
  return String(k)
    .replace(/\./g, " • ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function flattenObject(obj, prefix = "", out = {}) {
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flattenObject(v, path, out);
    else out[path] = v;
  }
  return out;
}

function normalizeToItems(obj) {
  if (!obj) return [];

  // string
  if (typeof obj === "string") {
    const s = obj.trim();
    return s ? [{ label: "Akses", value: s }] : [];
  }

  // array
  if (Array.isArray(obj)) {
    const out = [];
    for (const x of obj) {
      if (!x) continue;
      const k = x.label || x.key || x.name;
      const v = x.value || x.val || x.data;
      if (k && v) out.push({ label: String(k), value: String(v) });
    }
    return out;
  }

  // object
  if (typeof obj === "object") {
    const out = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue;
      const val = String(v).trim();
      if (!val) continue;
      out.push({ label: prettifyKey(k), value: val });
    }
    return out;
  }

  return [];
}

function scanLikelyCredentialKeys(raw) {
  const keys = [
    "email", "username", "user", "login",
    "password", "pass", "pin",
    "otp", "code",
    "link", "url",
    "notes", "note"
  ];

  const out = [];
  const flat = flattenObject(raw);

  for (const [k, v] of Object.entries(flat)) {
    const lk = String(k).toLowerCase();
    if (!keys.some(x => lk.includes(x))) continue;
    const val = String(v || "").trim();
    if (!val) continue;
    out.push({ label: prettifyKey(k), value: val });
  }

  return out.slice(0, 12);
}

function extractAccess(raw) {
  if (!raw) return { items: [], note: "Receipt belum tersedia." };

  const candidates = [
    raw.account_details,
    raw.accountDetail,
    raw.credentials,
    raw.data?.account_details,
    raw.data?.credentials,
    raw.details,
  ].filter(Boolean);

  for (const c of candidates) {
    const items = normalizeToItems(c);
    if (items.length) return { items, note: raw.note || null };
  }

  const items = scanLikelyCredentialKeys(raw);
  if (items.length) return { items, note: raw.note || null };

  return { items: [], note: "Akses belum tersedia dari provider. Coba refresh 1–2 menit." };
}

/* =========================
   Router
   ========================= */

module.exports = function publicRoutes({
  sequelize,
  AppSetting,
  Invoice,
  MarkupRule,
  ProductAsset,
  GobizAccount,
  eventBus,
}) {
  const r = express.Router();

  /* =========================
     GET /v1/products
     ========================= */
  r.get("/v1/products", publicLimiter, async (req, res) => {
    const products = await premifyGetProducts(AppSetting);

    const rules = await MarkupRule.findAll();
    const ruleMap = new Map(rules.map((x) => [x.variantId, x]));

    const assets = await ProductAsset.findAll();
    const byVariant = new Map();
    const byProduct = new Map();
    for (const a of assets) {
      if (a.variantId) byVariant.set(a.variantId, a);
      else byProduct.set(a.productId, a);
    }

    const out = products.map((p) => {
      const pImg = byProduct.get(p.id)?.imageUrl || null;

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        description: p.description,
        image: pImg,
        variants: (p.variants || []).map((v) => {
          const rule = ruleMap.get(v.id);
          const { markup, sellBase } = applyMarkup(Number(v.price), rule);
          const img = byVariant.get(v.id)?.imageUrl || pImg;

          return {
            id: v.id,
            name: v.name,
            duration: v.duration,
            type: v.type,
            warranty: v.warranty,
            stock: v.stock,
            price: sellBase,
            apiPrice: Number(v.price),
            markup,
            image: img,
          };
        }),
      };
    });

    res.json({ success: true, data: out });
  });

  /* =========================
     POST /v1/checkout  (idempotent)
     header: X-Idempotency-Key (optional)
     ========================= */
  r.post("/v1/checkout", checkoutLimiter, async (req, res) => {
    const { variantId, quantity = 1, voucherCode, emailInvite } = req.body || {};
    if (!variantId) return res.status(400).json({ error: "variantId required" });

    const idk = String(req.headers["x-idempotency-key"] || "").trim() || null;
    if (idk && idk.length > 120) return res.status(400).json({ error: "idempotency key too long" });

    // reuse invoice by idempotency key
    if (idk) {
      const existing = await Invoice.findOne({ where: { idempotencyKey: idk } });
      if (existing) {
        const baseWeb = process.env.BASE_PUBLIC_WEB || "https://pansa.my.id";
        return res.json({
          success: true,
          reused: true,
          data: {
            invoiceId: existing.invoiceId,
            status: existing.status,
            expiresAt: existing.expiresAt,
            payAmount: existing.payAmount,
            qrisUrl: existing.status === "PENDING"
              ? `${baseWeb}/qris/payment/${existing.publicToken}`
              : null,
          },
        });
      }
    }

    const ttlMin = Number(await getSetting(AppSetting, KEYS.INVOICE_TTL_MIN, "20"));
    const qrisStatic = await getSetting(AppSetting, KEYS.QRIS_STATIC, "");
    if (!qrisStatic) return res.status(500).json({ error: "QRIS_STATIC_NOT_SET" });

    const gobizAccountId =
      Number(await getSetting(AppSetting, KEYS.DEFAULT_GOBIZ_ACCOUNT_ID, "0")) || null;

    // resolve variant from Premify (source of truth)
    const products = await premifyGetProducts(AppSetting);

    let prodName = null,
      varName = null,
      apiPrice = null,
      varType = null,
      found = false;

    for (const p of products) {
      for (const v of p.variants || []) {
        if (v.id === variantId) {
          prodName = p.name;
          varName = v.name;
          apiPrice = Number(v.price);
          varType = v.type || null;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) return res.status(404).json({ error: "VARIANT_NOT_FOUND" });

    if (isInviteType(varType) && !emailInvite) {
      return res.status(400).json({ error: "emailInvite required for Invite type" });
    }

    const rule = await MarkupRule.findOne({ where: { variantId } });
    const { markup, sellBase } = applyMarkup(apiPrice, rule);

    const { uniqueCode, payAmount, expiresAt } = await generateUniqueSafe(
      Invoice,
      sellBase,
      ttlMin
    );

    const invoiceId = makeInvoiceId();
    const publicToken = makePublicToken();
    const qrisDynamic = makeDynamicQris(qrisStatic, payAmount, invoiceId);

    const profit = Number(markup || 0) * Number(quantity || 1);

    const clientIp = getClientIp(req);
    const clientUa = String(req.headers["user-agent"] || "").slice(0, 255);

    await Invoice.create({
      invoiceId,
      publicToken,
      idempotencyKey: idk,
      clientIp,
      clientUa,

      variantId,
      productName: prodName,
      variantName: varName,
      apiPrice,
      markup,
      sellBase,
      uniqueCode,
      payAmount,
      quantity,
      voucherCode: voucherCode || null,
      emailInvite: emailInvite || null,
      qrisDynamic,
      status: "PENDING",
      expiresAt,
      gobizAccountId,
      profit,
    });

    const baseWeb = process.env.BASE_PUBLIC_WEB || "https://pansa.my.id";
    const qrisUrl = `${baseWeb}/qris/payment/${publicToken}`;

    res.json({
      success: true,
      data: { invoiceId, status: "PENDING", expiresAt, payAmount, qrisUrl },
    });
  });

  /* =========================
     GET /v1/invoice/:invoiceId/public
     - publicToken hanya dikirim kalau masih PENDING
     ========================= */
  r.get("/v1/invoice/:invoiceId/public", publicLimiter, async (req, res) => {
    const inv = await Invoice.findOne({ where: { invoiceId: req.params.invoiceId } });
    if (!inv) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });

    res.json({
      success: true,
      data: {
        invoiceId: inv.invoiceId,
        status: inv.status,
        payAmount: inv.payAmount,
        expiresAt: inv.expiresAt,
        paidAt: inv.paidAt,
        premifyOrderId: inv.premifyOrderId,
        publicToken: inv.status === "PENDING" ? inv.publicToken : null,
      },
    });
  });

  /* =========================
     GET /v1/invoice/:invoiceId/receipt
     - sekarang return normalized access + raw
     ========================= */
  r.get("/v1/invoice/:invoiceId/receipt", publicLimiter, async (req, res) => {
    const inv = await Invoice.findOne({ where: { invoiceId: req.params.invoiceId } });
    if (!inv) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });
    if (inv.status !== "FULFILLED") return res.status(400).json({ error: "NOT_FULFILLED" });

    const raw = inv.premifyReceiptJson ? safeJsonParse(inv.premifyReceiptJson) : null;
    const access = extractAccess(raw);

    return res.json({
      success: true,
      data: {
        invoiceId: inv.invoiceId,
        status: inv.status,
        productName: inv.productName,
        variantName: inv.variantName,
        payAmount: inv.payAmount,
        premifyOrderId: inv.premifyOrderId,
        raw,
        access, // { items:[{label,value}], note }
      },
    });
  });

  /* =========================
     GET /qris/payment/:publicToken
     - PNG QR, hide after paid/expired
     ========================= */
  r.get("/qris/payment/:publicToken", async (req, res) => {
    const token = req.params.publicToken;
    const inv = await Invoice.findOne({ where: { publicToken: token } });
    if (!inv) return res.status(404).send("Not Found");

    if (inv.status !== "PENDING") return res.status(404).send("Not Found");

    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      await inv.update({ status: "EXPIRED" });
      eventBus.emit("invoice:update", { invoiceId: inv.invoiceId, status: "EXPIRED" });
      return res.status(404).send("Not Found");
    }

    const png = await QRCode.toBuffer(inv.qrisDynamic, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6,
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  });

  /* =========================
     GET /v1/checkout/:invoiceId/status
     - long poll + mutasi match + fulfill
     - IMPORTANT: jangan set FAILED hanya karena receipt fetch gagal
     ========================= */
  r.get("/v1/checkout/:invoiceId/status", pollLimiter, async (req, res) => {
    const invoiceId = req.params.invoiceId;
    const timeoutMs = Math.min(Number(req.query.timeoutMs || 120000), 180000);
    const intervalMs = 3000;

    const matchWindowMin = Number(process.env.PAY_MATCH_WINDOW_MIN || 20);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const inv = await Invoice.findOne({ where: { invoiceId } });
      if (!inv) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });

      if (inv.status === "FULFILLED") {
        return res.json({
          success: true,
          invoiceId,
          status: "FULFILLED",
          premifyOrderId: inv.premifyOrderId,
        });
      }
      if (inv.status === "FAILED") return res.json({ success: true, invoiceId, status: "FAILED" });
      if (inv.status === "EXPIRED") return res.json({ success: true, invoiceId, status: "EXPIRED" });

      // expire if needed
      if (inv.status === "PENDING" && new Date(inv.expiresAt).getTime() < Date.now()) {
        await inv.update({ status: "EXPIRED" });
        eventBus.emit("invoice:update", { invoiceId, status: "EXPIRED" });
        return res.json({ success: true, invoiceId, status: "EXPIRED" });
      }

      const gobizAccountId = inv.gobizAccountId;
      if (!gobizAccountId) return res.status(500).json({ error: "GOBIZ_ACCOUNT_NOT_SET" });

      const acc = await GobizAccount.findByPk(gobizAccountId);
      if (!acc || !acc.isActive) return res.status(500).json({ error: "GOBIZ_ACCOUNT_NOT_READY" });

      // hit mutasi (no cache)
      const date = nowYmdJakartaApprox();
      const txs = await getMutasi(acc, date, 60);

      const createdAt = new Date(inv.createdAt).getTime();
      const windowStart = createdAt - 2 * 60 * 1000; // allow skew
      const windowEnd = createdAt + matchWindowMin * 60 * 1000;

      let match = null;

      for (const t of txs) {
        if (t.amount !== inv.payAmount) continue;

        const tms = t.time ? new Date(t.time).getTime() : null;
        if (tms && (tms < windowStart || tms > windowEnd)) continue;

        // dedup txId
        if (t.id) {
          const used = await Invoice.findOne({
            where: {
              matchedTxId: t.id,
              invoiceId: { [Op.ne]: invoiceId },
            },
          });
          if (used) continue;
        }

        match = t;
        break;
      }

      if (match) {
        try {
          const result = await sequelize.transaction(async (tr) => {
            const locked = await Invoice.findOne({
              where: { invoiceId },
              transaction: tr,
              lock: tr.LOCK.UPDATE,
            });
            if (!locked) throw new Error("INVOICE_NOT_FOUND");

            if (locked.status === "FULFILLED") {
              return { status: "FULFILLED", premifyOrderId: locked.premifyOrderId };
            }

            // mark PAID first
            if (locked.status === "PENDING") {
              await locked.update(
                {
                  status: "PAID",
                  paidAt: new Date(),
                  matchedTxId: match.id || null,
                },
                { transaction: tr }
              );
              eventBus.emit("invoice:update", { invoiceId, status: "PAID" });
            }

            // create premify order
            const prem = await premifyCreateOrder(AppSetting, {
              variantId: locked.variantId,
              quantity: locked.quantity || 1,
              voucherCode: locked.voucherCode || undefined,
              emailInvite: locked.emailInvite || undefined,
            });

            // Try store receipt (NON-BLOCKING)
            let receipt = null;
            try {
              const list = await premifyGetTransactions(AppSetting);
              receipt = list.find((x) => x.order_id === prem.order_id) || null;
            } catch {
              // ignore (do NOT fail the order)
            }

            await locked.update(
              {
                status: "FULFILLED",
                premifyOrderId: prem.order_id,
                premifyReceiptJson: receipt
                  ? JSON.stringify(receipt)
                  : locked.premifyReceiptJson || null,
              },
              { transaction: tr }
            );

            eventBus.emit("invoice:update", {
              invoiceId,
              status: "FULFILLED",
              premifyOrderId: prem.order_id,
            });

            return { status: "FULFILLED", premifyOrderId: prem.order_id };
          });

          return res.json({ success: true, invoiceId, ...result });
        } catch (e) {
          // NOTE: kalau sudah create prem order tapi error lain,
          // jangan langsung FAILED kalau status di DB sudah PAID/FULFILLED.
          // Kita set FAILED hanya bila masih PENDING/PAID tanpa orderId.
          const cur = await Invoice.findOne({ where: { invoiceId } });

          if (cur && (cur.status === "FULFILLED" || cur.premifyOrderId)) {
            return res.json({
              success: true,
              invoiceId,
              status: cur.status,
              premifyOrderId: cur.premifyOrderId,
              note: "RECOVERED_AFTER_ERROR",
            });
          }

          await Invoice.update({ status: "FAILED" }, { where: { invoiceId } });
          eventBus.emit("invoice:update", { invoiceId, status: "FAILED", source: "fulfill-error" });
          return res.json({ success: true, invoiceId, status: "FAILED" });
        }
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return res.json({ success: true, invoiceId, status: "PENDING", note: "TIMEOUT" });
  });

  return r;
};
