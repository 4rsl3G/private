const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { adminLimiter } = require("../middlewares/rateLimiters");

module.exports = function adminAuthRoutes({ AdminUser }) {
  const r = express.Router();

  r.post("/admin/auth/login", adminLimiter, async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email & password required" });

    const admin = await AdminUser.findOne({ where: { email } });
    if (!admin || !admin.isActive) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const token = jwt.sign(
      { sub: String(admin.id), role: admin.role, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ success: true, access_token: token, admin: { id: admin.id, email: admin.email } });
  });

  return r;
};