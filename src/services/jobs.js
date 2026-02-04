const { Op } = require("sequelize");

function startJobs({ Invoice, eventBus }) {
  const intervalSec = Number(process.env.CLEANUP_INTERVAL_SEC || 60);
  const purgeDays = Number(process.env.PURGE_OLD_DAYS || 0);

  setInterval(async () => {
    try {
      // expire pending
      const now = new Date();
      const affected = await Invoice.update(
        { status: "EXPIRED" },
        { where: { status: "PENDING", expiresAt: { [Op.lte]: now } } }
      );

      // affected is [count] in mysql
      const count = Array.isArray(affected) ? (affected[0] || 0) : 0;
      if (count > 0) eventBus.emit("invoice:update", { invoiceId: "*", status: "EXPIRED_BATCH", count });

      // optional purge old rows
      if (purgeDays > 0) {
        const older = new Date(Date.now() - purgeDays * 864e5);
        await Invoice.destroy({
          where: {
            status: { [Op.in]: ["FULFILLED", "EXPIRED", "FAILED"] },
            updatedAt: { [Op.lte]: older }
          }
        });
      }
    } catch {}
  }, intervalSec * 1000);
}

module.exports = { startJobs };