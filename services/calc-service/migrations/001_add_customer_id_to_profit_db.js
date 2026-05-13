"use strict";

/**
 * profit_db: satisin yapildigi musteri referansi.
 */
exports.up = async (client) => {
  await client.query(
    `ALTER TABLE profit_db ADD COLUMN IF NOT EXISTS customer_id UUID NULL`
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_profit_db_customer_alive ON profit_db(customer_id)
     WHERE customer_id IS NOT NULL AND deleted_at IS NULL`
  );
};
