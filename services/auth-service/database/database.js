const { Pool } = require("pg");

const createPool = () => {
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 25 });
};

const initAuthDatabase = async (pool) => {
  try {
    await pool.query("SELECT 1");
    console.log("[auth-service][database] PostgreSQL baglantisi basarili.");

    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

    const existsResult = await pool.query(
      "SELECT to_regclass('public.users_db') IS NOT NULL AS exists"
    );
    const tableExists = existsResult.rows[0]?.exists === true;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        lastname VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone_number VARCHAR(20) NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);

    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_db_email_unique ON users_db(email)"
    );

    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_users_db_id ON users_db(id)"
    );

    if (tableExists) {
      console.log(
        "[auth-service][database] users_db zaten olusturulmus, basarili sekilde baglandi."
      );
    } else {
      console.log("[auth-service][database] users_db tablosu olusturuldu.");
    }
  } catch (error) {
    console.error("[auth-service][database] Baslatma hatasi:", error.message);
    throw error;
  }
};

module.exports = {
  createPool,
  initAuthDatabase
};
