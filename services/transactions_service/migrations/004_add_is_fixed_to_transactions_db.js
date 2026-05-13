module.exports = {
  up: async (db) => {
    await db.query(
      `ALTER TABLE transactions_db ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT FALSE`
    );
  }
};
