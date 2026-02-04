const axios = require("axios");
const { decrypt, encrypt } = require("../utils/cryptoBox");

const BASE_URL = process.env.GOBIZ_API_BASE || "https://api.gobiz.co.id";

function baseHeaders(acc) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "id",
    Origin: "https://portal.gofoodmerchant.co.id",
    Referer: "https://portal.gofoodmerchant.co.id/",
    "Authentication-Type": "go-id",
    "Gojek-Country-Code": "ID",
    "Gojek-Timezone": "Asia/Jakarta",
    "X-Appid": "go-biz-web-dashboard",
    "X-Appversion": "platform-v3.97.0-b986b897",
    "X-Deviceos": "Web",
    "X-Phonemake": "Windows 10 64-bit",
    "X-Phonemodel": "Chrome 143.0.0.0 on Windows 10 64-bit",
    "X-Platform": "Web",
    "X-Uniqueid": acc.uniqueId,
    "X-User-Type": "merchant",
    "User-Agent": acc.userAgent
  };
}

async function refreshToken(acc) {
  const refresh = decrypt(acc.refreshTokenEnc);
  if (!refresh) throw new Error("NO_REFRESH_TOKEN");

  const res = await axios.post(
    `${BASE_URL}/goid/token`,
    {
      client_id: "go-biz-web-new",
      grant_type: "refresh_token",
      data: { refresh_token: refresh, user_type: "merchant" }
    },
    { headers: baseHeaders(acc) }
  );

  const access = res.data.access_token;
  const newRefresh = res.data.refresh_token || refresh;
  const exp = Date.now() + (res.data.expires_in || 3600) * 1000;

  acc.accessTokenEnc = encrypt(access);
  acc.refreshTokenEnc = encrypt(newRefresh);
  acc.tokenExpiry = exp;
  await acc.save();
  return access;
}

async function getAccessToken(acc) {
  const exp = Number(acc.tokenExpiry || 0);
  const access = decrypt(acc.accessTokenEnc);
  if (access && exp && Date.now() < exp - 5 * 60 * 1000) return access;
  return refreshToken(acc);
}

async function authRequest(acc, method, url, data, extraHeaders = {}) {
  const access = await getAccessToken(acc);

  const res = await axios.request({
    method,
    url,
    data,
    headers: { ...baseHeaders(acc), Authorization: `Bearer ${access}`, ...extraHeaders },
    validateStatus: () => true
  });

  if (res.status === 401) {
    const access2 = await refreshToken(acc);
    const res2 = await axios.request({
      method,
      url,
      data,
      headers: { ...baseHeaders(acc), Authorization: `Bearer ${access2}`, ...extraHeaders },
      validateStatus: () => true
    });
    if (res2.status < 200 || res2.status >= 300) throw new Error(`HTTP_${res2.status}`);
    return res2.data;
  }

  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP_${res.status}`);
  return res.data;
}

function toRupiahFromSen(valueSen) {
  const n = typeof valueSen === "string" ? Number(valueSen) : valueSen;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / 100);
}
function pickAmountSen(tx) {
  const t = tx?.metadata?.transaction || {};
  const v =
    t.gross_amount ?? t.amount ?? t.total_amount ?? t.gopay_amount ??
    t.gopay?.amount ?? t.gopay?.gross_amount ?? t.details?.amount ?? t.details?.gross_amount;
  return typeof v === "string" ? Number(v) : v;
}
function normalizeTx(tx) {
  const t = tx?.metadata?.transaction || {};
  const amountSen = pickAmountSen(tx);
  const amount = toRupiahFromSen(amountSen);
  return {
    id: tx?.id || tx?._id || t?.order_id || t?.transaction_id || null,
    time: t?.transaction_time || tx?.time || null,
    status: t?.status || null,
    paymentType: t?.payment_type || null,
    amount,
    raw: tx
  };
}

async function getMerchantId(acc) {
  const r = await authRequest(acc, "POST", `${BASE_URL}/v1/merchants/search`, { from: 0, to: 1, _source: ["id","name"] });
  const m = r?.hits?.[0];
  if (m?.id) {
    acc.merchantId = m.id;
    acc.merchantName = m.name || acc.merchantName;
    await acc.save();
  }
  return acc.merchantId || null;
}

async function getMutasi(acc, dateYmd, size = 50) {
  const fromISO = `${dateYmd}T00:00:00+07:00`;
  const toISO = `${dateYmd}T23:59:59+07:00`;

  const merchantId = acc.merchantId || await getMerchantId(acc);
  if (!merchantId) throw new Error("MERCHANT_NOT_FOUND");

  const r = await authRequest(
    acc,
    "POST",
    `${BASE_URL}/journals/search`,
    {
      from: 0,
      size,
      sort: { time: { order: "desc" } },
      included_categories: { incoming: ["transaction_share", "action"] },
      query: [{
        op: "and",
        clauses: [
          { field: "metadata.transaction.merchant_id", op: "equal", value: merchantId },
          { field: "metadata.transaction.transaction_time", op: "gte", value: fromISO },
          { field: "metadata.transaction.transaction_time", op: "lte", value: toISO }
        ]
      }]
    },
    { Accept: "application/json, application/vnd.journal.v1+json" }
  );

  return (r?.hits || []).map(normalizeTx);
}

module.exports = { BASE_URL, baseHeaders, authRequest, getMerchantId, getMutasi };