const axios = require("axios");
const { getSetting, KEYS } = require("./settings");

async function premifyClient(AppSetting) {
  const baseURL = await getSetting(AppSetting, KEYS.PREMIFY_BASEURL, "https://premify.store/api/v1");
  const apiKey = await getSetting(AppSetting, KEYS.PREMIFY_APIKEY, "");
  if (!apiKey) throw new Error("PREMIFY_APIKEY_NOT_SET");

  return {
    baseURL,
    apiKey,
    http: axios.create({
      baseURL,
      timeout: 20000,
      headers: { "Content-Type": "application/json" }
    })
  };
}

function assertSuccess(res) {
  if (!res?.success) throw new Error(res?.message || "Premify API error");
  return res;
}

async function premifyGetProducts(AppSetting) {
  const c = await premifyClient(AppSetting);
  const { data } = await c.http.post("/products", { api_key: c.apiKey });
  assertSuccess(data);
  return data.data || [];
}

async function premifyGetBalance(AppSetting) {
  const c = await premifyClient(AppSetting);
  const { data } = await c.http.post("/balance", { api_key: c.apiKey });
  assertSuccess(data);
  return data.data;
}

async function premifyCreateOrder(AppSetting, { variantId, quantity = 1, voucherCode, emailInvite }) {
  const c = await premifyClient(AppSetting);
  const payload = { api_key: c.apiKey, variant_id: variantId, quantity };
  if (voucherCode) payload.voucher_code = voucherCode;
  if (emailInvite) payload.email_invite = emailInvite;

  const { data } = await c.http.post("/order", payload);
  assertSuccess(data);
  return data.data;
}

async function premifyGetTransactions(AppSetting) {
  const c = await premifyClient(AppSetting);
  const { data } = await c.http.post("/transactions", { api_key: c.apiKey });
  assertSuccess(data);
  return data.data || [];
}

module.exports = {
  premifyGetProducts,
  premifyGetBalance,
  premifyCreateOrder,
  premifyGetTransactions
};