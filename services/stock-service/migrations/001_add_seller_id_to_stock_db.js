module.exports = {
  up: async (db) => {
    await db.query(`ALTER TABLE stock_db ADD COLUMN IF NOT EXISTS seller_id UUID NULL`);
  }
};
