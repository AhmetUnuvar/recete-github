exports.up = async (db) => {
  await db.query(
    `ALTER TABLE product_db ADD COLUMN IF NOT EXISTS total_days INTEGER NOT NULL DEFAULT 1`
  );
  await db.query(`UPDATE product_db SET total_days = 1 WHERE total_days IS NULL OR total_days < 1`);
};
