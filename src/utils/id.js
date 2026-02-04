const crypto = require("crypto");

function makeInvoiceId() {
  const ymd = new Date().toISOString().slice(0,10).replaceAll("-", "");
  return `INV-${ymd}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
function makePublicToken() {
  return crypto.randomBytes(18).toString("base64url");
}

module.exports = { makeInvoiceId, makePublicToken };