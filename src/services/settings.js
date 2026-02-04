const { encrypt, decrypt } = require("../utils/cryptoBox");

const KEYS = {
  PREMIFY_BASEURL: "premify.baseurl",
  PREMIFY_APIKEY: "premify.apikey",
  QRIS_STATIC: "qris.static",
  INVOICE_TTL_MIN: "invoice.ttl_min",
  DEFAULT_GOBIZ_ACCOUNT_ID: "gobiz.default_account_id"
};

async function ensureDefaults(AppSetting) {
  const defaults = [
    [KEYS.PREMIFY_BASEURL, process.env.DEFAULT_PREMIFY_BASEURL || "https://premify.store/api/v1"],
    [KEYS.PREMIFY_APIKEY, process.env.DEFAULT_PREMIFY_APIKEY || ""],
    [KEYS.QRIS_STATIC, process.env.DEFAULT_QRIS_STATIC || ""],
    [KEYS.INVOICE_TTL_MIN, String(process.env.DEFAULT_INVOICE_TTL_MIN || 20)]
  ];

  for (const [key, val] of defaults) {
    const row = await AppSetting.findOne({ where: { key } });
    if (!row) await AppSetting.create({ key, valueEnc: encrypt(val) });
  }
}

async function getSetting(AppSetting, key, fallback = null) {
  const row = await AppSetting.findOne({ where: { key } });
  if (!row?.valueEnc) return fallback;
  return decrypt(row.valueEnc);
}

async function setSetting(AppSetting, key, value, adminId) {
  await AppSetting.upsert({ key, valueEnc: encrypt(value ?? ""), updatedByAdminId: adminId || null });
  return true;
}

module.exports = { KEYS, ensureDefaults, getSetting, setSetting };