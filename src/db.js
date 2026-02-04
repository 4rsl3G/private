const { Sequelize } = require("sequelize");

function makeSequelize() {
  return new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    dialect: "mysql",
    logging: false,
    pool: { max: 10, min: 0, idle: 10000 }
  });
}

module.exports = { makeSequelize };