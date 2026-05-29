const { Pool } = require("pg");
const crypto = require("crypto");

const REF_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateReferenceCode = () => {
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += REF_CHARS[crypto.randomInt(0, REF_CHARS.length)];
  }
  return code;
};

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

    await pool.query(`
      ALTER TABLE users_db
      ADD COLUMN IF NOT EXISTS reference_code VARCHAR(12)
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_db_reference_code_alive
      ON users_db(reference_code)
      WHERE deleted_at IS NULL AND reference_code IS NOT NULL
    `);

    const missingRef = await pool.query(
      `SELECT id FROM users_db WHERE reference_code IS NULL AND deleted_at IS NULL`
    );
    for (const row of missingRef.rows) {
      let inserted = false;
      for (let attempt = 0; attempt < 8 && !inserted; attempt += 1) {
        const code = generateReferenceCode();
        try {
          await pool.query(`UPDATE users_db SET reference_code = $1 WHERE id = $2::uuid`, [
            code,
            row.id
          ]);
          inserted = true;
        } catch (err) {
          if (err.code !== "23505") throw err;
        }
      }
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shared_account_access_db (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id UUID NOT NULL,
        member_user_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL,
        CONSTRAINT chk_shared_access_not_self CHECK (owner_user_id <> member_user_id)
      )
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_shared_access_owner_member_alive
      ON shared_account_access_db(owner_user_id, member_user_id)
      WHERE deleted_at IS NULL
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_access_member_alive
      ON shared_account_access_db(member_user_id)
      WHERE deleted_at IS NULL
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_shared_access_owner_alive
      ON shared_account_access_db(owner_user_id)
      WHERE deleted_at IS NULL
    `);

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
  initAuthDatabase,
  generateReferenceCode
};
