module.exports = {
  up: async (db) => {
    await db.query(
      `ALTER TABLE customers_db ADD COLUMN IF NOT EXISTS is_done BOOLEAN NOT NULL DEFAULT FALSE`
    );
  }
};
