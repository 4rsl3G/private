require("dotenv").config();
const bcrypt = require("bcrypt");
const { makeSequelize } = require("../db");
const { initModels } = require("../models");

async function main() {
  const sequelize = makeSequelize();
  const { AdminUser } = initModels(sequelize);

  await sequelize.authenticate();
  await sequelize.sync();

  const email = process.env.SEED_ADMIN_EMAIL;
  const pass = process.env.SEED_ADMIN_PASS;
  if (!email || !pass) throw new Error("Missing SEED_ADMIN_EMAIL/SEED_ADMIN_PASS");

  const exists = await AdminUser.findOne({ where: { email } });
  if (exists) { console.log("Admin already exists:", email); return; }

  const hash = await bcrypt.hash(pass, 12);
  await AdminUser.create({ email, passwordHash: hash, role: "ADMIN" });
  console.log("Admin created:", email);
}

main().catch((e) => { console.error(e); process.exit(1); });