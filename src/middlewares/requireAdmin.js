const jwt = require("jsonwebtoken");

module.exports = function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");
  if (type !== "Bearer" || !token) return res.status(401).json({ error: "UNAUTHORIZED" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== "ADMIN") return res.status(403).json({ error: "FORBIDDEN" });
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
};