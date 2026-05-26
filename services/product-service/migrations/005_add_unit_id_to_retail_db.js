module.exports = {
  up: async (db) => {
    await db.query(`
      ALTER TABLE retail_db
      ADD COLUMN IF NOT EXISTS unit_id UUID NULL
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_retail_db_unit_id
      ON retail_db(unit_id)
      WHERE deleted_at IS NULL
    `);
  }
};
