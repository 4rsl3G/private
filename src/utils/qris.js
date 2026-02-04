function parseTLV(str) {
  const map = new Map();
  let i = 0;
  while (i < str.length) {
    const id = str.slice(i, i + 2); i += 2;
    const len = Number(str.slice(i, i + 2)); i += 2;
    const val = str.slice(i, i + len); i += len;
    map.set(id, val);
    if (id === "63") break;
  }
  return map;
}

function buildTLV(map) {
  const ids = Array.from(map.keys()).filter(id => id !== "63").sort((a,b)=>Number(a)-Number(b));
  let out = "";
  for (const id of ids) {
    const val = map.get(id) ?? "";
    out += id + String(val.length).padStart(2, "0") + val;
  }
  return out;
}

function crc16ccitt(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function parseSubTLV(str) {
  const map = new Map();
  let i = 0;
  while (i < str.length) {
    const id = str.slice(i, i + 2); i += 2;
    const len = Number(str.slice(i, i + 2)); i += 2;
    const val = str.slice(i, i + len); i += len;
    map.set(id, val);
  }
  return map;
}
function buildSubTLV(map) {
  const ids = Array.from(map.keys()).sort((a,b)=>Number(a)-Number(b));
  let out = "";
  for (const id of ids) {
    const val = map.get(id) ?? "";
    out += id + String(val.length).padStart(2, "0") + val;
  }
  return out;
}

function makeDynamicQris(staticQris, amountRupiah, invoiceRef) {
  const map = parseTLV(staticQris);
  map.set("01", "12");                 // dynamic
  map.set("54", String(amountRupiah)); // amount

  if (invoiceRef) {
    const old62 = map.get("62") || "";
    const sub = parseSubTLV(old62);
    sub.set("05", String(invoiceRef).slice(0, 25)); // reference
    map.set("62", buildSubTLV(sub));
  }

  const noCrc = buildTLV(map) + "6304";
  const crc = crc16ccitt(noCrc);
  return noCrc + crc;
}

module.exports = { makeDynamicQris };