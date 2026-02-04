const { Op } = require("sequelize");

function applyMarkup(apiPrice, rule) {
  if (!rule || !rule.isActive) return { markup: 0, sellBase: apiPrice };
  if (rule.type === "FIXED") return { markup: rule.value, sellBase: apiPrice + rule.value };
  if (rule.type === "PERCENT") {
    const sellBase = Math.round(apiPrice * (1 + rule.value / 100));
    return { markup: sellBase - apiPrice, sellBase };
  }
  return { markup: 0, sellBase: apiPrice };
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function generateUniqueSafe(Invoice, sellBase, ttlMinutes) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  for (let attempt = 0; attempt < 120; attempt++) {
    const uniqueCode = randInt(1, 999);
    const payAmount = sellBase + uniqueCode;

    const exists = await Invoice.findOne({
      where: {
        payAmount,
        status: "PENDING",
        expiresAt: { [Op.gt]: new Date() }
      }
    });

    if (!exists) return { uniqueCode, payAmount, expiresAt };
  }

  throw new Error("UNIQUE_CODE_EXHAUSTED");
}

module.exports = { applyMarkup, generateUniqueSafe };