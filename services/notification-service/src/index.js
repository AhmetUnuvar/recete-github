const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createPool, initNotificationDatabase } = require("../database/database");

const app = express();
const port = process.env.PORT || 4009;
const pool = createPool();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "notification-service", ok: true });
});

/**
 * api-gateway /notifications altinda mount edildiginde Express path on eki duser;
 * burada /pending ve /dismiss kullanilir. Dogrudan servise istek icin uzun yol da var.
 */
const getPending = async (req, res) => {
  const { user_id, target_page } = req.query;
  if (!user_id?.trim() || !target_page?.trim()) {
    return res.status(400).json({ message: "user_id ve target_page zorunlu." });
  }
  try {
    const result = await pool.query(
      `SELECT n.id, n.title, n.message, n.target_page, n.is_active, n.created_at, n.updated_at
       FROM notification_db n
       WHERE n.deleted_at IS NULL
         AND n.is_active = TRUE
         AND n.target_page = $1
         AND NOT EXISTS (
           SELECT 1
           FROM user_notifications u
           WHERE u.notifications_id = n.id
             AND u.user_id = $2::uuid
             AND u.is_dismissed = TRUE
         )
       ORDER BY n.created_at ASC`,
      [String(target_page).trim(), user_id]
    );
    return res.json({ notifications: result.rows });
  } catch (error) {
    console.error("[notification-service][pending] Hata:", error.message);
    return res.status(500).json({ message: "Bildirimler okunamadi.", detail: error.message });
  }
};

const postDismiss = async (req, res) => {
  const { user_id, notification_id } = req.body || {};
  if (!user_id || !notification_id) {
    return res.status(400).json({ message: "user_id ve notification_id zorunlu." });
  }
  try {
    const check = await pool.query(
      `SELECT id FROM notification_db
       WHERE id = $1::uuid AND deleted_at IS NULL AND is_active = TRUE`,
      [notification_id]
    );
    if (check.rowCount === 0) {
      return res.status(404).json({ message: "Bildirim bulunamadi." });
    }

    const upsert = await pool.query(
      `INSERT INTO user_notifications (user_id, notifications_id, is_dismissed, dismissed_at)
       VALUES ($1::uuid, $2::uuid, TRUE, NOW())
       ON CONFLICT (user_id, notifications_id)
       DO UPDATE SET is_dismissed = TRUE, dismissed_at = NOW()
       RETURNING id, user_id, notifications_id, is_dismissed, dismissed_at`,
      [user_id, notification_id]
    );
    return res.json({ ok: true, row: upsert.rows[0] });
  } catch (error) {
    console.error("[notification-service][dismiss] Hata:", error.message);
    return res.status(400).json({ message: "Bildirim kapatilamadi.", detail: error.message });
  }
};

app.get("/pending", getPending);
app.get("/notifications/pending", getPending);
app.post("/dismiss", postDismiss);
app.post("/notifications/dismiss", postDismiss);

const start = async () => {
  await initNotificationDatabase(pool);
  app.listen(port, () => {
    console.log(`[notification-service] HTTP ${port} portunda calisiyor.`);
  });
};

start().catch((error) => {
  console.error("[notification-service] Baslatilamadi:", error.message);
  process.exit(1);
});
