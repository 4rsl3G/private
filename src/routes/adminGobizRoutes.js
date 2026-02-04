const express = require("express");
const crypto = require("crypto");
const UserAgents = require("user-agents");
const axios = require("axios");

const requireAdmin = require("../middlewares/requireAdmin");
const { adminLimiter } = require("../middlewares/rateLimiters");
const { encrypt } = require("../utils/cryptoBox");
const { BASE_URL, baseHeaders, getMerchantId } = require("../services/gobiz");
const { KEYS, setSetting } = require("../services/settings");

module.exports = function adminGobizRoutes({ GobizAccount, AppSetting }) {
  const r = express.Router();

  r.post("/admin/gobiz/init", requireAdmin, adminLimiter, async (req, res) => {
    const name = req.body?.name || "Primary";

    const [acc] = await GobizAccount.findOrCreate({
      where: { name },
      defaults: {
        name,
        uniqueId: crypto.randomUUID(),
        userAgent: new UserAgents({ deviceCategory: "desktop" }).toString(),
        isActive: true
      }
    });

    await setSetting(AppSetting, KEYS.DEFAULT_GOBIZ_ACCOUNT_ID, String(acc.id), Number(req.admin.sub));
    res.json({ success: true, data: { id: acc.id, name: acc.name } });
  });

  r.post("/admin/gobiz/otp/request", requireAdmin, adminLimiter, async (req, res) => {
    const { accountId, phone, countryCode = "62" } = req.body || {};
    if (!accountId || !phone) return res.status(400).json({ error: "accountId & phone required" });

    const acc = await GobizAccount.findByPk(accountId);
    if (!acc) return res.status(404).json({ error: "ACCOUNT_NOT_FOUND" });

    const resp = await axios.post(
      `${BASE_URL}/goid/login/request`,
      { client_id: "go-biz-web-new", phone_number: phone, country_code: countryCode },
      { headers: { ...baseHeaders(acc), Authorization: "Bearer" } }
    );

    res.json({ success: true, data: resp.data.data });
  });

  r.post("/admin/gobiz/otp/verify", requireAdmin, adminLimiter, async (req, res) => {
    const { accountId, otp, otpToken } = req.body || {};
    if (!accountId || !otp || !otpToken) return res.status(400).json({ error: "accountId, otp, otpToken required" });

    const acc = await GobizAccount.findByPk(accountId);
    if (!acc) return res.status(404).json({ error: "ACCOUNT_NOT_FOUND" });

    const resp = await axios.post(
      `${BASE_URL}/goid/token`,
      { client_id: "go-biz-web-new", grant_type: "otp", data: { otp, otp_token: otpToken } },
      { headers: { ...baseHeaders(acc), Authorization: "Bearer" } }
    );

    acc.accessTokenEnc = encrypt(resp.data.access_token);
    acc.refreshTokenEnc = encrypt(resp.data.refresh_token);
    acc.tokenExpiry = Date.now() + (resp.data.expires_in || 3600) * 1000;
    await acc.save();

    await getMerchantId(acc);
    res.json({ success: true, data: { merchantId: acc.merchantId, merchantName: acc.merchantName } });
  });

  r.get("/admin/gobiz/:accountId/status", requireAdmin, adminLimiter, async (req, res) => {
    const acc = await GobizAccount.findByPk(req.params.accountId);
    if (!acc) return res.status(404).json({ error: "ACCOUNT_NOT_FOUND" });

    res.json({
      success: true,
      data: {
        connected: !!acc.refreshTokenEnc && !!acc.merchantId && acc.isActive,
        merchantId: acc.merchantId,
        merchantName: acc.merchantName,
        tokenExpiry: acc.tokenExpiry,
        isActive: acc.isActive
      }
    });
  });

  return r;
};