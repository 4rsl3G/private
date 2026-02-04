module.exports = (sequelize, DataTypes) => {
  return sequelize.define("Invoice", {
    invoiceId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    publicToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },

    // Idempotency untuk checkout
    idempotencyKey: { type: DataTypes.STRING(120), allowNull: true, unique: true },
    clientIp: { type: DataTypes.STRING(64), allowNull: true },
    clientUa: { type: DataTypes.STRING(255), allowNull: true },

    variantId: { type: DataTypes.STRING(64), allowNull: false },
    productName: { type: DataTypes.STRING(200), allowNull: false },
    variantName: { type: DataTypes.STRING(200), allowNull: false },

    apiPrice: { type: DataTypes.INTEGER, allowNull: false },
    markup: { type: DataTypes.INTEGER, allowNull: false },
    sellBase: { type: DataTypes.INTEGER, allowNull: false },

    uniqueCode: { type: DataTypes.INTEGER, allowNull: false },
    payAmount: { type: DataTypes.INTEGER, allowNull: false },

    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    voucherCode: { type: DataTypes.STRING(80), allowNull: true },

    emailInvite: { type: DataTypes.STRING(190), allowNull: true },

    qrisDynamic: { type: DataTypes.TEXT("long"), allowNull: false },

    status: {
      type: DataTypes.ENUM("PENDING", "PAID", "FULFILLED", "EXPIRED", "FAILED"),
      allowNull: false,
      defaultValue: "PENDING"
    },

    expiresAt: { type: DataTypes.DATE, allowNull: false },
    paidAt: { type: DataTypes.DATE, allowNull: true },

    matchedTxId: { type: DataTypes.STRING(128), allowNull: true },

    premifyOrderId: { type: DataTypes.STRING(64), allowNull: true },
    premifyReceiptJson: { type: DataTypes.TEXT("long"), allowNull: true },

    gobizAccountId: { type: DataTypes.INTEGER, allowNull: true },

    profit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  }, {
    tableName: "invoices",
    indexes: [
      { fields: ["status"] },
      { fields: ["expiresAt"] },
      { fields: ["payAmount"] },
      { fields: ["createdAt"] }
    ]
  });
};