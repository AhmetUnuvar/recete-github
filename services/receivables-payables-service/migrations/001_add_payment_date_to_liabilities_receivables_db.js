exports.up = async (client) => {
  await client.query(
    `ALTER TABLE liabilities_receivables_db ADD COLUMN IF NOT EXISTS payment_date DATE NULL`
  );
};
