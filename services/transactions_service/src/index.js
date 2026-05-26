const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createPool, initTransactionsDatabase } = require("../database/database");
const { getCache, setCache, delCache } = require("./cache");

const TTL_TX = 15; // transactions - kisa TTL, sik degisiyor

const app = express();
const port = process.env.PORT || 4006;
const pool = createPool();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "transactions-service", ok: true });
});

app.get("/transactions", async (req, res) => {
  const { user_id, limit, buyer_id } = req.query;
  if (!user_id) return res.status(400).json({ message: "user_id zorunlu." });
  const parsedLimit = Number(limit);
  const safeLimit = Number.isNaN(parsedLimit) || parsedLimit <= 0 ? 200 : Math.min(parsedLimit, 1000);

  const cacheKey = `cache:transactions:${user_id}:${buyer_id || "none"}:${safeLimit}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const buyerFilterOn = Boolean(buyer_id);
    const result = await pool.query(
      `SELECT
         t.id,
         t.user_id,
         t.transaction_time,
         t.amount,
         t.is_income,
         t.is_fixed,
         t.buyer_id,
         t.product_id,
         t.transaction_name,
         p.product_name,
         pr.profit_amount,
         t.created_at,
         t.updated_at,
         t.deleted_at
       FROM transactions_db t
       LEFT JOIN product_db p
         ON p.id = t.product_id
        AND p.user_id = t.user_id
       LEFT JOIN profit_db pr
         ON pr.transaction_id = t.id
        AND pr.user_id = t.user_id
        AND pr.deleted_at IS NULL
       WHERE t.user_id = $1
         AND ($2::boolean = FALSE OR buyer_id = $3::uuid)
         AND t.deleted_at IS NULL
       ORDER BY t.transaction_time DESC
       LIMIT $4`,
      [user_id, buyerFilterOn, buyer_id || null, safeLimit]
    );
    await setCache(cacheKey, result.rows, TTL_TX);
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "Islemler listelenemedi.", detail: error.message });
  }
});

app.post("/transactions", async (req, res) => {
  const {
    user_id,
    amount,
    is_income,
    is_fixed = false,
    transaction_time,
    buyer_id,
    product_id,
    transaction_name
  } = req.body || {};
  if (!user_id || amount === undefined || typeof is_income !== "boolean") {
    return res.status(400).json({ message: "user_id, amount ve is_income zorunlu." });
  }
  if (typeof is_fixed !== "boolean") {
    return res.status(400).json({ message: "is_fixed boolean olmali." });
  }
  const parsedAmount = Number(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ message: "amount sifirdan buyuk sayi olmali." });
  }
  const parsedTime = transaction_time ? new Date(transaction_time) : new Date();
  if (Number.isNaN(parsedTime.getTime())) {
    return res.status(400).json({ message: "transaction_time gecersiz." });
  }
  try {
    const result = await pool.query(
      `INSERT INTO transactions_db (
         user_id, transaction_time, amount, is_income, is_fixed, buyer_id, product_id, transaction_name
       )
       VALUES ($1, $2, $3::numeric, $4, $5, $6::uuid, $7::uuid, $8)
       RETURNING id, user_id, transaction_time, amount, is_income, is_fixed, buyer_id, product_id, transaction_name, created_at, updated_at, deleted_at`,
      [
        user_id,
        parsedTime.toISOString(),
        parsedAmount,
        is_income,
        is_fixed,
        buyer_id || null,
        product_id || null,
        transaction_name ? String(transaction_name).trim() : null
      ]
    );
    // Kisa TTL'ye ek olarak aninda gecersizlestir: buyer bazli + genel sorgular
    await delCache(
      `cache:transactions:${user_id}:none:200`,
      `cache:transactions:${user_id}:none:5`,
      buyer_id ? `cache:transactions:${user_id}:${buyer_id}:200` : null
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(400).json({ message: "Islem kaydedilemedi.", detail: error.message });
  }
});

app.patch("/transactions/:id", async (req, res) => {
  const transactionId = req.params.id;
  const { user_id, amount, transaction_name } = req.body || {};
  if (!transactionId || !user_id || amount === undefined) {
    return res.status(400).json({ message: "id, user_id ve amount zorunlu." });
  }
  const parsedAmount = Number(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ message: "amount sifirdan buyuk sayi olmali." });
  }
  const normalizedName = transaction_name == null ? null : String(transaction_name).trim();
  try {
    const result = await pool.query(
      `UPDATE transactions_db
       SET amount = $1::numeric,
           transaction_name = $2,
           updated_at = NOW()
       WHERE id = $3::uuid
         AND user_id = $4::uuid
         AND deleted_at IS NULL
       RETURNING id, user_id, transaction_time, amount, is_income, is_fixed, buyer_id, product_id, transaction_name, created_at, updated_at, deleted_at`,
      [parsedAmount, normalizedName || null, transactionId, user_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Islem bulunamadi." });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(400).json({ message: "Islem guncellenemedi.", detail: error.message });
  }
});

app.delete("/transactions/:id", async (req, res) => {
  const transactionId = req.params.id;
  const { user_id } = req.body || {};
  if (!transactionId || !user_id) {
    return res.status(400).json({ message: "id ve user_id zorunlu." });
  }
  try {
    const result = await pool.query(
      `UPDATE transactions_db
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND deleted_at IS NULL
       RETURNING id`,
      [transactionId, user_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Islem bulunamadi." });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ message: "Islem silinemedi.", detail: error.message });
  }
});

const start = async () => {
  await initTransactionsDatabase(pool);
  app.listen(port, () => {
    console.log(`Transactions service running on ${port}`);
  });
};

start().catch((error) => {
  console.error("[transactions-service] Baslatilamadi:", error.message);
  process.exit(1);
});
