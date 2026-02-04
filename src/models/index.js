const { DataTypes } = require("sequelize");

function initModels(sequelize) {
  const AdminUser = require("./AdminUser")(sequelize, DataTypes);
  const AppSetting = require("./AppSetting")(sequelize, DataTypes);
  const GobizAccount = require("./GobizAccount")(sequelize, DataTypes);
  const MarkupRule = require("./MarkupRule")(sequelize, DataTypes);
  const ProductAsset = require("./ProductAsset")(sequelize, DataTypes);
  const Invoice = require("./Invoice")(sequelize, DataTypes);

  return { AdminUser, AppSetting, GobizAccount, MarkupRule, ProductAsset, Invoice };
}

module.exports = { initModels };