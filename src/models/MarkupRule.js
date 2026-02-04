module.exports = (sequelize, DataTypes) => {
  return sequelize.define("MarkupRule", {
    variantId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    type: { type: DataTypes.ENUM("FIXED", "PERCENT"), allowNull: false, defaultValue: "FIXED" },
    value: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { tableName: "markup_rules" });
};