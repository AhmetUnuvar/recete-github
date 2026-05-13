const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const createPool = () => {
  return new Pool({ connectionString: process.env.DATABASE_URL });
};

const runMigrations = async (pool) => {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("[stock-service][migrations] migrations klasoru bulunamadi, atlandi.");
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
      console.log(`[stock-service][migrations] ${fileName} basariyla calistirildi.`);
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

const initStockDatabase = async (pool) => {
  try {
    await pool.query("SELECT 1");
    console.log("[stock-service][database] PostgreSQL baglantisi basarili.");

    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    const existsResult = await pool.query(
      "SELECT to_regclass('public.unit_db') IS NOT NULL AS exists"
    );
    const tableExists = existsResult.rows[0]?.exists === true;
    const currencyExistsResult = await pool.query(
      "SELECT to_regclass('public.currency_db') IS NOT NULL AS exists"
    );
    const currencyTableExists = currencyExistsResult.rows[0]?.exists === true;
    const stockCategoryExistsResult = await pool.query(
      "SELECT to_regclass('public.stock_category_db') IS NOT NULL AS exists"
    );
    const stockCategoryTableExists = stockCategoryExistsResult.rows[0]?.exists === true;
    const stockExistsResult = await pool.query(
      "SELECT to_regclass('public.stock_db') IS NOT NULL AS exists"
    );
    const stockTableExists = stockExistsResult.rows[0]?.exists === true;
    const sellerExistsResult = await pool.query(
      "SELECT to_regclass('public.seller_db') IS NOT NULL AS exists"
    );
    const sellerTableExists = sellerExistsResult.rows[0]?.exists === true;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS unit_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        unit_name VARCHAR(50) NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await pool.query(
      "ALTER TABLE unit_db ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE"
    );

    await pool.query("CREATE INDEX IF NOT EXISTS idx_unit_db_user_id ON unit_db(user_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_unit_db_unit_name ON unit_db(unit_name)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_unit_db_is_default ON unit_db(is_default)");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS currency_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        currency_name VARCHAR(20) NOT NULL,
        currency_abbreviation VARCHAR(10) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_currency_db_abbreviation ON currency_db(currency_abbreviation)"
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_category_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        stock_category_name VARCHAR(50) NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await pool.query(
      "ALTER TABLE stock_category_db ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_stock_category_db_user_id ON stock_category_db(user_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_stock_category_db_name ON stock_category_db(stock_category_name)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_stock_category_db_is_default ON stock_category_db(is_default)"
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        stock_category_id UUID NOT NULL,
        stock_name VARCHAR(100) NOT NULL,
        stock_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
        unit_id UUID NOT NULL,
        unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
        seller_id UUID NULL,
        currency_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await pool.query("ALTER TABLE stock_db ADD COLUMN IF NOT EXISTS seller_id UUID NULL");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_stock_db_user_id ON stock_db(user_id)");
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_stock_db_category_id ON stock_db(stock_category_id)"
    );
    await pool.query("CREATE INDEX IF NOT EXISTS idx_stock_db_unit_id ON stock_db(unit_id)");
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_stock_db_currency_id ON stock_db(currency_id)"
    );
    await pool.query("CREATE INDEX IF NOT EXISTS idx_stock_db_seller_id ON stock_db(seller_id)");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS seller_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        seller_name VARCHAR(200) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await pool.query("CREATE INDEX IF NOT EXISTS idx_seller_db_user_id ON seller_db(user_id)");
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_seller_db_user_alive ON seller_db(user_id) WHERE deleted_at IS NULL"
    );

    if (tableExists) {
      console.log(
        "[stock-service][database] unit_db zaten olusturulmus, basarili sekilde baglandi."
      );
    } else {
      console.log("[stock-service][database] unit_db tablosu olusturuldu.");
    }

    if (currencyTableExists) {
      console.log(
        "[stock-service][database] currency_db zaten olusturulmus, basarili sekilde baglandi."
      );
    } else {
      console.log("[stock-service][database] currency_db tablosu olusturuldu.");
    }

    if (stockCategoryTableExists) {
      console.log(
        "[stock-service][database] stock_category_db zaten olusturulmus, basarili sekilde baglandi."
      );
    } else {
      console.log("[stock-service][database] stock_category_db tablosu olusturuldu.");
    }

    if (stockTableExists) {
      console.log(
        "[stock-service][database] stock_db zaten olusturulmus, basarili sekilde baglandi."
      );
    } else {
      console.log("[stock-service][database] stock_db tablosu olusturuldu.");
    }

    if (sellerTableExists) {
      console.log(
        "[stock-service][database] seller_db zaten olusturulmus, basarili sekilde baglandi."
      );
    } else {
      console.log("[stock-service][database] seller_db tablosu olusturuldu.");
    }

    await runMigrations(pool);
  } catch (error) {
    console.error("[stock-service][database] Baslatma hatasi:", error.message);
    throw error;
  }
};

module.exports = {
  createPool,
  initStockDatabase
};
