const express = require("express");
const crypto = require("crypto");

function safeEq(a, b) {
  const ba = Buffer.from(a || "", "utf8");
  const bb = Buffer.from(b || "", "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = function webhookPremifyRoutes({ AppSetting, Invoice, eventBus, getSetting, KEYS }) {
  const r = express.Router();

  r.post("/webhook", async (req, res) => {
    const signature = req.headers["x-premify-signature"] || "";
    const raw = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body || {});

    const secret = await getSetting(AppSetting, KEYS.PREMIFY_APIKEY, "");
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");

    if (!safeEq(expected, signature)) return res.status(401).send("Invalid Signature");

    const payload = req.body || {};
    const event = payload.event || "";
    const data = payload.data || {};
    const orderId = data.order_id || null;

    if (orderId) {
      const inv = await Invoice.findOne({ where: { premifyOrderId: orderId } });
      if (inv) {
        if (event === "order.completed") {
          if (inv.status !== "FULFILLED") await inv.update({ status: "FULFILLED" });
          eventBus.emit("invoice:update", { invoiceId: inv.invoiceId, status: "FULFILLED", source: "premify-webhook" });
        } else if (event === "order.failed") {
          await inv.update({ status: "FAILED" });
          eventBus.emit("invoice:update", { invoiceId: inv.invoiceId, status: "FAILED", source: "premify-webhook" });
        }
      }
    }

    eventBus.emit("premify:webhook", { event, data });
    res.json({ status: "ok" });
  });

  return r;
};