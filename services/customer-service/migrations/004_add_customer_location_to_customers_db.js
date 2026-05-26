module.exports = {
  up: async (db) => {
    await db.query(`
      ALTER TABLE customers_db
      ADD COLUMN IF NOT EXISTS customer_city UUID NULL
        REFERENCES cities_db(id)
    `);
    await db.query(`
      ALTER TABLE customers_db
      ADD COLUMN IF NOT EXISTS customer_district VARCHAR(200) NULL
    `);
    await db.query(`
      ALTER TABLE customers_db
      ADD COLUMN IF NOT EXISTS customer_address TEXT NULL
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_customers_db_customer_city
      ON customers_db(customer_city)
      WHERE deleted_at IS NULL
    `);
  }
};
