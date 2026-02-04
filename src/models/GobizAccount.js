module.exports = (sequelize, DataTypes) => {
  return sequelize.define("GobizAccount", {
    name: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "Primary" },

    merchantId: { type: DataTypes.STRING(64), allowNull: true },
    merchantName: { type: DataTypes.STRING(190), allowNull: true },

    accessTokenEnc: { type: DataTypes.TEXT("long"), allowNull: true },
    refreshTokenEnc: { type: DataTypes.TEXT("long"), allowNull: true },
    tokenExpiry: { type: DataTypes.BIGINT, allowNull: true },

    uniqueId: { type: DataTypes.STRING(64), allowNull: false },
    userAgent: { type: DataTypes.STRING(255), allowNull: false },

    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { tableName: "gobiz_accounts" });
};