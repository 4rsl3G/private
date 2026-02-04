const express = require("express");
const requireAdmin = require("../middlewares/requireAdmin");

function sseHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Connection", "keep-alive");
}

function send(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

module.exports = function sseRoutes({ eventBus }) {
  const r = express.Router();

  r.get("/sse/admin", requireAdmin, (req, res) => {
    sseHeaders(res);
    send(res, "hello", { ok: true, ts: Date.now() });

    const onInv = (payload) => send(res, "invoice:update", payload);
    const onHook = (payload) => send(res, "premify:webhook", payload);

    eventBus.on("invoice:update", onInv);
    eventBus.on("premify:webhook", onHook);

    req.on("close", () => {
      eventBus.off("invoice:update", onInv);
      eventBus.off("premify:webhook", onHook);
    });
  });

  r.get("/sse/invoice/:invoiceId", (req, res) => {
    const invoiceId = req.params.invoiceId;
    sseHeaders(res);
    send(res, "hello", { invoiceId, ts: Date.now() });

    const onInv = (payload) => {
      if (payload.invoiceId === invoiceId) send(res, "invoice:update", payload);
    };

    eventBus.on("invoice:update", onInv);

    req.on("close", () => {
      eventBus.off("invoice:update", onInv);
    });
  });

  return r;
};