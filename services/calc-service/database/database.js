const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const createPool = () => new Pool({ connectionString: process.env.DATABASE_URL });

const runMigrations = async (pool) => {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("[calc-service][migrations] migrations klasoru bulunamadi, atlandi.");
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
      console.log(`[calc-service][migrations] ${fileName} basariyla calistirildi.`);
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

const initCalcDatabase = async (pool) => {
  try {
    await pool.query("SELECT 1");
    console.log("[calc-service][database] PostgreSQL baglantisi basarili.");

    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    const existsResult = await pool.query(
      "SELECT to_regclass('public.profit_db') IS NOT NULL AS exists"
    );
    const tableExistedBefore = existsResult.rows[0]?.exists === true;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS profit_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        transaction_id UUID NULL,
        product_id UUID NULL,
        customer_id UUID NULL,
        profit_amount NUMERIC(14, 4) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);

    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_profit_db_user_id ON profit_db(user_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_profit_db_user_alive ON profit_db(user_id) WHERE deleted_at IS NULL"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_profit_db_transaction ON profit_db(transaction_id) WHERE transaction_id IS NOT NULL AND deleted_at IS NULL"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_profit_db_product ON profit_db(product_id) WHERE product_id IS NOT NULL AND deleted_at IS NULL"
    );

    await runMigrations(pool);

    if (tableExistedBefore) {
      console.log("[calc-service][database] profit_db zaten mevcut, baglandi.");
    } else {
      console.log("[calc-service][database] profit_db tablosu olusturuldu.");
    }
  } catch (error) {
    console.error("[calc-service][database] Baslatma hatasi:", error.message);
    throw error;
  }
};

module.exports = {
  createPool,
  initCalcDatabase
};
