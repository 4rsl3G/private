require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const EventEmitter = require("events");

const { makeSequelize } = require("./db");
const { initModels } = require("./models");
const { ensureDefaults, KEYS, getSetting } = require("./services/settings");
const { startJobs } = require("./services/jobs");

// routes
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const adminSettingsRoutes = require("./routes/adminSettingsRoutes");
const adminGobizRoutes = require("./routes/adminGobizRoutes");
const adminPremifyRoutes = require("./routes/adminPremifyRoutes");
const adminMarkupRoutes = require("./routes/adminMarkupRoutes");
const adminAssetsRoutes = require("./routes/adminAssetsRoutes");
const adminDashboardRoutes = require("./routes/adminDashboardRoutes");
const adminInvoicesRoutes = require("./routes/adminInvoicesRoutes");
const webhookPremifyRoutes = require("./routes/webhookPremifyRoutes");
const sseRoutes = require("./routes/sseRoutes");
const publicRoutes = require("./routes/publicRoutes");

async function main() {
  if (!process.env.JWT_SECRET) throw new Error("Missing env: JWT_SECRET");
  if (!process.env.MASTER_KEY) throw new Error("Missing env: MASTER_KEY");

  const sequelize = makeSequelize();
  const models = initModels(sequelize);

  await sequelize.authenticate();
  await sequelize.sync();

  await ensureDefaults(models.AppSetting);

  const eventBus = new EventEmitter();
  eventBus.setMaxListeners(200);

  // start cleanup jobs
  startJobs({ Invoice: models.Invoice, eventBus });

  const app = express();

  app.set("trust proxy", 1);

  app.use(
  helmet({
    contentSecurityPolicy: false,

    // ✅ penting: biar IMG/QR dari domain api bisa dipakai oleh web domain lain
    crossOriginResourcePolicy: { policy: "cross-origin" },

    // ✅ biar tidak ganggu embed/resource lintas origin
    crossOriginEmbedderPolicy: false,
  })
);

  app.use(cors({ origin: true, credentials: true }));

  // IMPORTANT: rawBody for webhook signature verification
  app.use(express.json({
    limit: "1mb",
    verify: (req, res, buf) => { req.rawBody = buf; }
  }));

  // serve uploads if used
  app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads"), {
    setHeaders: (res) => res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
  }));

  app.get("/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

  const v1 = express.Router();

  // admin
  v1.use(adminAuthRoutes(models));
  v1.use(adminSettingsRoutes(models));
  v1.use(adminGobizRoutes(models));
  v1.use(adminPremifyRoutes(models));
  v1.use(adminMarkupRoutes(models));
  v1.use(adminAssetsRoutes(models));
  v1.use(adminDashboardRoutes(models));
  v1.use(adminInvoicesRoutes({ sequelize, ...models, eventBus }));

  // sse
  v1.use(sseRoutes({ eventBus }));

  // webhook
  v1.use(webhookPremifyRoutes({
    AppSetting: models.AppSetting,
    Invoice: models.Invoice,
    eventBus,
    getSetting,
    KEYS
  }));

  // public
  v1.use(publicRoutes({ sequelize, ...models, eventBus }));

  app.use("/v1", v1);

  // QR endpoint also on root for pansa.my.id reverse-proxy convenience
  app.use(publicRoutes({ sequelize, ...models, eventBus }));

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, () => console.log(`Server running on :${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
