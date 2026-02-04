module.exports = (sequelize, DataTypes) => {
  return sequelize.define("AdminUser", {
    email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    role: { type: DataTypes.ENUM("ADMIN"), allowNull: false, defaultValue: "ADMIN" },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  }, { tableName: "admin_users" });
};