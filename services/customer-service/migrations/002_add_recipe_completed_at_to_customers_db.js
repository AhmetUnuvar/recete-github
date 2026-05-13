module.exports = {
  up: async (db) => {
    await db.query(
      `ALTER TABLE customers_db ADD COLUMN IF NOT EXISTS recipe_completed_at TIMESTAMPTZ NULL`
    );
    await db.query(`
      UPDATE customers_db
      SET recipe_completed_at = COALESCE(recipe_completed_at, updated_at)
      WHERE is_done = TRUE AND recipe_completed_at IS NULL
    `);
  }
};
