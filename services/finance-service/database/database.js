const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const createPool = () => new Pool({ connectionString: process.env.DATABASE_URL });

const runMigrations = async (pool) => {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("[finance-service][migrations] migrations klasoru bulunamadi, atlandi.");
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
      console.log(`[finance-service][migrations] ${fileName} basariyla calistirildi.`);
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

const initFinanceDatabase = async (pool) => {
  try {
    await pool.query("SELECT 1");
    console.log("[finance-service][database] PostgreSQL baglantisi basarili.");

    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    const fixedExistsResult = await pool.query(
      "SELECT to_regclass('public.fixed_db') IS NOT NULL AS exists"
    );
    const fixedTableExists = fixedExistsResult.rows[0]?.exists === true;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS fixed_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        fixed_name VARCHAR(200) NOT NULL,
        is_fixed_income BOOLEAN NOT NULL,
        amount NUMERIC(14, 4) NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);

    await pool.query(
      `ALTER TABLE fixed_db ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE`
    );

    await pool.query("CREATE INDEX IF NOT EXISTS idx_fixed_db_user_id ON fixed_db(user_id)");
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_fixed_db_user_alive ON fixed_db(user_id) WHERE deleted_at IS NULL"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_fixed_db_type_alive ON fixed_db(is_fixed_income) WHERE deleted_at IS NULL"
    );

    if (fixedTableExists) {
      console.log("[finance-service][database] fixed_db zaten olusturulmus, baglandi.");
    } else {
      console.log("[finance-service][database] fixed_db tablosu olusturuldu.");
    }

    await runMigrations(pool);
  } catch (error) {
    console.error("[finance-service][database] Baslatma hatasi:", error.message);
    throw error;
  }
};

module.exports = {
  createPool,
  initFinanceDatabase
};
