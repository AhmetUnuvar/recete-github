const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const createPool = () => new Pool({ connectionString: process.env.DATABASE_URL, max: 25 });

const runMigrations = async (pool) => {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("[transactions-service][migrations] migrations klasoru bulunamadi, atlandi.");
    return;
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".js"))
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of files) {
    const migrationPath = path.join(migrationsDir, fileName);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const migration = require(migrationPath);
    if (typeof migration.up !== "function") {
      throw new Error(`Gecersiz migration dosyasi: ${fileName} (up fonksiyonu yok).`);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await migration.up(client);
      await client.query("COMMIT");
      console.log(`[transactions-service][migrations] ${fileName} basariyla calistirildi.`);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (_rollbackError) {
        /* ignore */
      }
      throw error;
    } finally {
      client.release();
    }
  }
};

const initTransactionsDatabase = async (pool) => {
  try {
    await pool.query("SELECT 1");
    console.log("[transactions-service][database] PostgreSQL baglantisi basarili.");

    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    const existsResult = await pool.query(
      "SELECT to_regclass('public.transactions_db') IS NOT NULL AS exists"
    );
    const tableExists = existsResult.rows[0]?.exists === true;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        transaction_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        amount NUMERIC(14, 4) NOT NULL,
        is_income BOOLEAN NOT NULL,
        is_fixed BOOLEAN NOT NULL DEFAULT FALSE,
        buyer_id UUID NULL,
        product_id UUID NULL,
        transaction_name VARCHAR(200) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await pool.query(`ALTER TABLE transactions_db ADD COLUMN IF NOT EXISTS buyer_id UUID NULL`);
    await pool.query(`ALTER TABLE transactions_db ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE transactions_db ADD COLUMN IF NOT EXISTS product_id UUID NULL`);
    await pool.query(`ALTER TABLE transactions_db ADD COLUMN IF NOT EXISTS transaction_name VARCHAR(200) NULL`);
    await pool.query("CREATE INDEX IF NOT EXISTS idx_transactions_db_user_id ON transactions_db(user_id)");
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_transactions_db_user_time_alive ON transactions_db(user_id, transaction_time DESC) WHERE deleted_at IS NULL"
    );

    if (tableExists) {
      console.log("[transactions-service][database] transactions_db zaten olusturulmus, baglandi.");
    } else {
      console.log("[transactions-service][database] transactions_db tablosu olusturuldu.");
    }

    await runMigrations(pool);
  } catch (error) {
    console.error("[transactions-service][database] Baslatma hatasi:", error.message);
    throw error;
  }
};

module.exports = {
  createPool,
  initTransactionsDatabase
};
