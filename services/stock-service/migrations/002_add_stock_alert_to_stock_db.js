module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE stock_db ADD COLUMN IF NOT EXISTS stock_alert NUMERIC(12, 3) NULL`);
  }
};
