const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const createPool = () => {
  return new Pool({ connectionString: process.env.DATABASE_URL });
};

const runMigrations = async (pool) => {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("[product-service][migrations] migrations klasoru bulunamadi, atlandi.");
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
      console.log(`[product-service][migrations] ${fileName} basariyla calistirildi.`);
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

const initProductDatabase = async (pool) => {
  try {
    await pool.query("SELECT 1");
    console.log("[product-service][database] PostgreSQL baglantisi basarili.");

    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    const productExistsResult = await pool.query(
      "SELECT to_regclass('public.product_db') IS NOT NULL AS exists"
    );
    const productTableExists = productExistsResult.rows[0]?.exists === true;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        stock_id UUID[] NOT NULL DEFAULT '{}',
        product_name VARCHAR(200) NOT NULL,
        total_days INTEGER NOT NULL DEFAULT 1,
        total_hours NUMERIC(14, 4) NOT NULL DEFAULT 1,
        material_cost_total NUMERIC(14, 4) NOT NULL DEFAULT 0,
        cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
        price NUMERIC(14, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);

    await pool.query(`
      ALTER TABLE product_db ADD COLUMN IF NOT EXISTS material_cost_total NUMERIC(14, 4) NOT NULL DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE product_db ADD COLUMN IF NOT EXISTS cost NUMERIC(14, 4) NOT NULL DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE product_db ADD COLUMN IF NOT EXISTS price NUMERIC(14, 4) NOT NULL DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE product_db ADD COLUMN IF NOT EXISTS total_days INTEGER NOT NULL DEFAULT 1
    `);
    await pool.query(`
      ALTER TABLE product_db ADD COLUMN IF NOT EXISTS total_hours NUMERIC(14, 4) NOT NULL DEFAULT 1
    `);
    await pool.query(
      `UPDATE product_db SET material_cost_total = 0 WHERE material_cost_total IS NULL`
    );
    await pool.query(`UPDATE product_db SET cost = 0 WHERE cost IS NULL`);
    await pool.query(`UPDATE product_db SET price = 0 WHERE price IS NULL`);
    await pool.query(`UPDATE product_db SET total_days = 1 WHERE total_days IS NULL OR total_days < 1`);

    await pool.query("CREATE INDEX IF NOT EXISTS idx_product_db_user_id ON product_db(user_id)");
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_product_db_stock_id ON product_db USING GIN (stock_id)"
    );

    if (productTableExists) {
      console.log("[product-service][database] product_db zaten mevcut, baglandi.");
    } else {
      console.log("[product-service][database] product_db tablosu olusturuldu.");
    }

    const ownedExistsResult = await pool.query(
      "SELECT to_regclass('public.owned_product_db') IS NOT NULL AS exists"
    );
    const ownedTableExists = ownedExistsResult.rows[0]?.exists === true;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS owned_product_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        product_id UUID NOT NULL REFERENCES product_db (id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);

    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_owned_product_db_user_id ON owned_product_db (user_id)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_owned_product_db_product_id ON owned_product_db (product_id)"
    );
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_owned_product_db_user_alive
      ON owned_product_db (user_id)
      WHERE deleted_at IS NULL
    `);

    if (ownedTableExists) {
      console.log("[product-service][database] owned_product_db zaten mevcut, baglandi.");
    } else {
      console.log("[product-service][database] owned_product_db tablosu olusturuldu.");
    }

    await runMigrations(pool);
  } catch (error) {
    console.error("[product-service][database] Baslatma hatasi:", error.message);
    throw error;
  }
};

module.exports = {
  createPool,
  initProductDatabase
};
