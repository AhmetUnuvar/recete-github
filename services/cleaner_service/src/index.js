const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
const RETENTION_DAYS = Number(process.env.CLEANER_RETENTION_DAYS || 45);
const CLEANUP_INTERVAL_MS = Number(process.env.CLEANER_INTERVAL_MS || 24 * 60 * 60 * 1000);

if (!DATABASE_URL) {
  console.error("[cleaner-service] DATABASE_URL zorunlu.");
  process.exit(1);
}

if (Number.isNaN(RETENTION_DAYS) || RETENTION_DAYS <= 0) {
  console.error("[cleaner-service] CLEANER_RETENTION_DAYS pozitif sayi olmali.");
  process.exit(1);
}

if (Number.isNaN(CLEANUP_INTERVAL_MS) || CLEANUP_INTERVAL_MS <= 0) {
  console.error("[cleaner-service] CLEANER_INTERVAL_MS pozitif sayi olmali.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

const tablesInDeleteOrder = [
  "owned_product_db",
  "product_db",
  "fixed_db",
  "customers_db",
  "transactions_db",
  "stock_db",
  "stock_category_db",
  "unit_db",
  "currency_db",
  "users_db"
];

const ts = () => new Date().toISOString();
const log = (msg) => console.log(`[cleaner-service][${ts()}] ${msg}`);
const logError = (msg, error) => {
  if (error && error.stack) {
    console.error(`[cleaner-service][${ts()}] ${msg}\n${error.stack}`);
    return;
  }
  console.error(`[cleaner-service][${ts()}] ${msg}`, error ? String(error) : "");
};

const deleteExpiredSoftDeletedRows = async () => {
  const runId = Date.now();
  const startedAt = Date.now();
  const client = await pool.connect();
  try {
    log(`Temizlik turu basladi. run_id=${runId}`);
    await client.query("BEGIN");

    let totalDeleted = 0;
    for (const tableName of tablesInDeleteOrder) {
      const query = `
        DELETE FROM ${tableName}
        WHERE deleted_at IS NOT NULL
          AND deleted_at < NOW() - ($1::int * INTERVAL '1 day')
      `;
      const result = await client.query(query, [RETENTION_DAYS]);
      totalDeleted += result.rowCount || 0;
      log(
        `${tableName}: ${result.rowCount || 0} kayit kalici silindi (deleted_at > ${RETENTION_DAYS} gun). run_id=${runId}`
      );
    }

    await client.query("COMMIT");
    log(
      `Temizlik tamamlandi. run_id=${runId}, toplam_silinen=${totalDeleted}, sure_ms=${
        Date.now() - startedAt
      }`
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_rollbackError) {
      /* noop */
    }
    logError(`Temizlik hatasi. run_id=${runId}`, error);
  } finally {
    client.release();
  }
};

const start = async () => {
  await pool.query("SELECT 1");
  log("PostgreSQL baglantisi basarili.");
  log(`Retention: ${RETENTION_DAYS} gun, interval: ${CLEANUP_INTERVAL_MS} ms.`);
  log("Cleaner service aktif. Loglari docker logs cleaner-service ile takip edebilirsiniz.");

  await deleteExpiredSoftDeletedRows();
  setInterval(deleteExpiredSoftDeletedRows, CLEANUP_INTERVAL_MS);
};

start().catch((error) => {
  logError("Baslatma hatasi", error);
  process.exit(1);
});
