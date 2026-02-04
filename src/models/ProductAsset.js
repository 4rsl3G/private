module.exports = (sequelize, DataTypes) => {
  return sequelize.define("ProductAsset", {
    productId: { type: DataTypes.STRING(64), allowNull: false },
    variantId: { type: DataTypes.STRING(64), allowNull: true },
    imagePath: { type: DataTypes.STRING(255), allowNull: true },
    imageUrl: { type: DataTypes.STRING(500), allowNull: true },
    label: { type: DataTypes.STRING(120), allowNull: true }
  }, {
    tableName: "product_assets",
    indexes: [
      { fields: ["productId"] },
      { fields: ["variantId"] },
      { unique: true, fields: ["productId", "variantId"] }
    ]
  });
};