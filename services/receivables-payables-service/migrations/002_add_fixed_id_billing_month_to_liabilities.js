exports.up = async (client) => {
  await client.query(
    `ALTER TABLE liabilities_receivables_db ADD COLUMN IF NOT EXISTS fixed_id UUID NULL`
  );
  await client.query(
    `ALTER TABLE liabilities_receivables_db ADD COLUMN IF NOT EXISTS billing_month DATE NULL`
  );
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_liabilities_receiver_fixed
    ON liabilities_receivables_db(fixed_id)
    WHERE deleted_at IS NULL AND fixed_id IS NOT NULL
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_liabilities_fixed_billing_unique
    ON liabilities_receivables_db (fixed_id, billing_month)
    WHERE deleted_at IS NULL AND fixed_id IS NOT NULL AND billing_month IS NOT NULL
  `);
};
