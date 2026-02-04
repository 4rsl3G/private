module.exports = (sequelize, DataTypes) => {
  return sequelize.define("AppSetting", {
    key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    valueEnc: { type: DataTypes.TEXT("long"), allowNull: true },
    updatedByAdminId: { type: DataTypes.INTEGER, allowNull: true }
  }, { tableName: "app_settings" });
};