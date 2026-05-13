const { Pool } = require("pg");

const createPool = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for mail-service");
  }
  return new Pool({ connectionString });
};

const initMailDatabase = async (pool) => {
  await pool.query("SELECT 1");
  console.log("[mail-service][database] PostgreSQL baglantisi basarili.");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mail_registration_codes (
      email VARCHAR(255) PRIMARY KEY,
      code_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_mail_registration_codes_expires ON mail_registration_codes(expires_at)"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mail_password_reset_codes (
      email VARCHAR(255) PRIMARY KEY,
      code_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_mail_password_reset_codes_expires ON mail_password_reset_codes(expires_at)"
  );

  console.log("[mail-service][database] mail_registration_codes ve mail_password_reset_codes hazir.");
};

module.exports = {
  createPool,
  initMailDatabase
};
