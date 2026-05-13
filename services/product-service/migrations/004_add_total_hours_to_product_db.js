/**
 * total_hours: sabit gider payi (aylik/720)*saat
 * Eski kayitlar: bir kerelik total_hours = total_days * 24 (onceki gunluk modelle ayni maliyet)
 */
exports.up = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_service_applied_patches (
      patch_id TEXT PRIMARY KEY
    )
  `);
  await client.query(`
    ALTER TABLE product_db ADD COLUMN IF NOT EXISTS total_hours NUMERIC(14, 4) NOT NULL DEFAULT 1
  `);
  const ins = await client.query(
    `INSERT INTO product_service_applied_patches (patch_id) VALUES ('004_total_hours_backfill') ON CONFLICT (patch_id) DO NOTHING RETURNING patch_id`
  );
  if (ins.rowCount > 0) {
    await client.query(`
      UPDATE product_db
      SET total_hours = GREATEST(COALESCE(total_days, 1), 1) * 24
    `);
  }
};
