module.exports = {
  up: async (db) => {
    await db.query(`
      ALTER TABLE product_db
      ADD COLUMN IF NOT EXISTS cost NUMERIC(14, 4) NOT NULL DEFAULT 0
    `);
    await db.query(`
      ALTER TABLE product_db
      ADD COLUMN IF NOT EXISTS price NUMERIC(14, 4) NOT NULL DEFAULT 0
    `);
    await db.query(`UPDATE product_db SET cost = 0 WHERE cost IS NULL`);
    await db.query(`UPDATE product_db SET price = 0 WHERE price IS NULL`);
  }
};
