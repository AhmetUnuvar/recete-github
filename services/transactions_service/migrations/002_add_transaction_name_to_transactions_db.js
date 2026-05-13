module.exports = {
  up: async (db) => {
    await db.query(
      `ALTER TABLE transactions_db ADD COLUMN IF NOT EXISTS transaction_name VARCHAR(200) NULL`
    );
  }
};
