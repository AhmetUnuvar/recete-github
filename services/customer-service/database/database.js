const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const createPool = () => new Pool({ connectionString: process.env.DATABASE_URL, max: 25 });

const runMigrations = async (pool) => {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("[customer-service][migrations] migrations klasoru bulunamadi, atlandi.");
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
      console.log(`[customer-service][migrations] ${fileName} basariyla calistirildi.`);
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

const initCustomerDatabase = async (pool) => {
  try {
    await pool.query("SELECT 1");
    console.log("[customer-service][database] PostgreSQL baglantisi basarili.");

    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    const existsResult = await pool.query(
      "SELECT to_regclass('public.customers_db') IS NOT NULL AS exists"
    );
    const tableExists = existsResult.rows[0]?.exists === true;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        customer_name VARCHAR(200) NOT NULL,
        customer_phone VARCHAR(80),
        customer_company_name VARCHAR(200),
        customer_id_number VARCHAR(100),
        current_name VARCHAR(200),
        is_done BOOLEAN NOT NULL DEFAULT FALSE,
        recipe_completed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await pool.query(`ALTER TABLE customers_db ADD COLUMN IF NOT EXISTS is_done BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(
      `ALTER TABLE customers_db ADD COLUMN IF NOT EXISTS recipe_completed_at TIMESTAMPTZ NULL`
    );

    await pool.query("CREATE INDEX IF NOT EXISTS idx_customers_db_user_id ON customers_db(user_id)");
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_customers_db_user_alive ON customers_db(user_id) WHERE deleted_at IS NULL`
    );

    if (tableExists) {
      console.log("[customer-service][database] customers_db zaten mevcut, baglandi.");
    } else {
      console.log("[customer-service][database] customers_db tablosu olusturuldu.");
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS cities_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        city_name VARCHAR(120) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_db_city_name_alive
      ON cities_db (LOWER(city_name))
      WHERE deleted_at IS NULL
    `);

    const citiesExists = await pool.query(
      "SELECT to_regclass('public.cities_db') IS NOT NULL AS exists"
    );
    if (citiesExists.rows[0]?.exists === true) {
      console.log("[customer-service][database] cities_db hazir.");
    } else {
      console.log("[customer-service][database] cities_db tablosu olusturuldu.");
    }

    await runMigrations(pool);
  } catch (error) {
    console.error("[customer-service][database] Baslatma hatasi:", error.message);
    throw error;
  }
};

module.exports = {
  createPool,
  initCustomerDatabase
};
