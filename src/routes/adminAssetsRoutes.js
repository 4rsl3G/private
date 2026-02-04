const express = require("express");
const multer = require("multer");
const requireAdmin = require("../middlewares/requireAdmin");
const { adminLimiter } = require("../middlewares/rateLimiters");
const { saveSquareWebp } = require("../utils/imageStore");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });

module.exports = function adminAssetsRoutes({ ProductAsset }) {
  const r = express.Router();

  r.post("/admin/assets/upload", requireAdmin, adminLimiter, upload.single("file"), async (req, res) => {
    if (!req.file?.buffer) return res.status(400).json({ error: "file required" });
    const url = await saveSquareWebp(req.file.buffer);
    res.json({ success: true, url });
  });

  r.post("/admin/assets/set", requireAdmin, adminLimiter, async (req, res) => {
    const { productId, variantId = null, imageUrl, label } = req.body || {};
    if (!productId || !imageUrl) return res.status(400).json({ error: "productId & imageUrl required" });

    await ProductAsset.upsert({
      productId,
      variantId,
      imageUrl,
      imagePath: imageUrl.startsWith("/uploads/") ? imageUrl : null,
      label: label || null
    });

    res.json({ success: true });
  });

  return r;
};