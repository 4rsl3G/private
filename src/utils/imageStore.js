const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "products");

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

async function saveSquareWebp(buffer) {
  ensureDir();
  const filename = `product-${crypto.randomBytes(8).toString("hex")}.webp`;
  const abs = path.join(UPLOAD_DIR, filename);

  await sharp(buffer)
    .resize(512, 512, { fit: "cover", position: "centre" })
    .webp({ quality: 82 })
    .toFile(abs);

  return `/uploads/products/${filename}`;
}

module.exports = { saveSquareWebp };