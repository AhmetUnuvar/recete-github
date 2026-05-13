const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const createPool = () => new Pool({ connectionString: process.env.DATABASE_URL });

const runMigrations = async (pool) => {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log("[receivables-payables-service][migrations] migrations klasoru bulunamadi, atlandi.");
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
      console.log(`[receivables-payables-service][migrations] ${fileName} basariyla calistirildi.`);
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

/** finance-service ile paylasilan sabit gelir/gider tablosu (GET /balances JOIN icin once gelmeli). */
const ensureFixedDbTable = async (pool) => {
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
};

const createLiabilitiesReceivablesTableIfNeeded = async (pool) => {
  const before = await pool.query(
    "SELECT to_regclass('public.liabilities_receivables_db') IS NOT NULL AS exists"
  );
  const existedBefore = before.rows[0]?.exists === true;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS liabilities_receivables_db (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      seller_id UUID NULL,
      customer_id UUID NULL,
      transaction_id UUID NULL,
      fixed_id UUID NULL,
      billing_month DATE NULL,
      is_paid BOOLEAN NOT NULL DEFAULT FALSE,
      amount NUMERIC(14, 4) NOT NULL,
      remaining_amount NUMERIC(14, 4) NOT NULL,
      is_receivable BOOLEAN NOT NULL,
      payment_date DATE NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL
    )
  `);

  if (existedBefore) {
    console.log(
      "[receivables-payables-service][database] liabilities_receivables_db zaten mevcut, baglandi."
    );
  } else {
    console.log("[receivables-payables-service][database] liabilities_receivables_db tablosu olusturuldu.");
  }
};

/** Migration'lardan sonra; eski DB'de fixed_id once ALTER ile gelir. */
const ensureLiabilitiesReceivablesIndexes = async (pool) => {
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_liabilities_receiver_user ON liabilities_receivables_db(user_id) WHERE deleted_at IS NULL"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_liabilities_receiver_customer ON liabilities_receivables_db(customer_id) WHERE deleted_at IS NULL AND customer_id IS NOT NULL"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_liabilities_receiver_seller ON liabilities_receivables_db(seller_id) WHERE deleted_at IS NULL AND seller_id IS NOT NULL"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_liabilities_receiver_txn ON liabilities_receivables_db(transaction_id) WHERE deleted_at IS NULL AND transaction_id IS NOT NULL"
  );
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_liabilities_receiver_fixed
    ON liabilities_receivables_db(fixed_id)
    WHERE deleted_at IS NULL AND fixed_id IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_liabilities_fixed_billing_unique
    ON liabilities_receivables_db (fixed_id, billing_month)
    WHERE deleted_at IS NULL AND fixed_id IS NOT NULL AND billing_month IS NOT NULL
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_liabilities_receiver_open ON liabilities_receivables_db(user_id, is_paid) WHERE deleted_at IS NULL AND is_paid = FALSE"
  );
};

const initReceivablesPayablesDatabase = async (pool) => {
  try {
    await pool.query("SELECT 1");
    console.log("[receivables-payables-service][database] PostgreSQL baglantisi basarili.");

    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    await ensureFixedDbTable(pool);
    await createLiabilitiesReceivablesTableIfNeeded(pool);
    await runMigrations(pool);
    await ensureLiabilitiesReceivablesIndexes(pool);

    console.log("[receivables-payables-service][database] Tablo kontrolu tamamlandi.");
  } catch (error) {
    console.error("[receivables-payables-service][database] Baslatma hatasi:", error.message);
    throw error;
  }
};

module.exports = {
  createPool,
  initReceivablesPayablesDatabase
};
