module.exports = {
  up: async (db) => {
    await db.query(
      `ALTER TABLE fixed_db ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE`
    );
  }
};
