module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE product_db ADD COLUMN IF NOT EXISTS product_alert NUMERIC(12, 3) NULL`);
  }
};
