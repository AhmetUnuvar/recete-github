const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createPool, initStockDatabase } = require("../database/database");
const { getCache, setCache, delCache } = require("./cache");

const TTL_GLOBAL = 3600;   // items, currencies
const TTL_USER_LONG = 1800; // categories, units, sellers
const TTL_USER = 30;        // stocks

const app = express();
const port = process.env.PORT || 4002;
const pool = createPool();
const transactionsServiceBase = (process.env.TRANSACTIONS_SERVICE_URL || "http://localhost:4006").replace(/\/$/, "");

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

const postTransaction = async ({ user_id, amount, is_income, buyer_id = null, transaction_name = null }) => {
  const parsedAmount = Number(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return null;
  }
  const response = await fetch(`${transactionsServiceBase}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, amount: parsedAmount, is_income, buyer_id, transaction_name })
  });
  const txt = await response.text();
  if (!response.ok) {
    throw new Error(`transactions-service ${response.status}: ${txt}`);
  }
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
};

app.get("/health", (_req, res) => {
  res.json({ service: "stock-service", ok: true });
});

app.get("/items", async (_req, res) => {
  const cacheKey = "cache:items";
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  const result = await pool.query("SELECT * FROM stock_items ORDER BY id DESC");
  await setCache(cacheKey, result.rows, TTL_GLOBAL);
  res.json(result.rows);
});

app.get("/categories", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu" });
  }

  const cacheKey = `cache:categories:${user_id}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await pool.query(
      `SELECT id, user_id, stock_category_name, is_default, created_at
       FROM stock_category_db
       WHERE deleted_at IS NULL
         AND (is_default = TRUE OR user_id = $1)
       ORDER BY created_at DESC`
      ,
      [user_id]
    );
    await setCache(cacheKey, result.rows, TTL_USER_LONG);
    return res.json(result.rows);
  } catch (error) {
    console.error("[stock-service][categories] listeleme hatasi:", error.message);
    return res.status(500).json({ message: "kategoriler listelenemedi" });
  }
});

app.get("/units", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu" });
  }

  const cacheKey = `cache:units:${user_id}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await pool.query(
      `SELECT id, user_id, unit_name, is_default, created_at
       FROM unit_db
       WHERE deleted_at IS NULL
         AND (is_default = TRUE OR user_id = $1)
       ORDER BY created_at DESC`,
      [user_id]
    );
    await setCache(cacheKey, result.rows, TTL_USER_LONG);
    return res.json(result.rows);
  } catch (error) {
    console.error("[stock-service][units] listeleme hatasi:", error.message);
    return res.status(500).json({ message: "birimler listelenemedi" });
  }
});

app.get("/currencies", async (_req, res) => {
  const cacheKey = "cache:currencies";
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const result = await pool.query(
      `SELECT id, currency_name, currency_abbreviation, created_at
       FROM currency_db
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    );
    await setCache(cacheKey, result.rows, TTL_GLOBAL);
    return res.json(result.rows);
  } catch (error) {
    console.error("[stock-service][currencies] listeleme hatasi:", error.message);
    return res.status(500).json({ message: "para birimleri listelenemedi" });
  }
});

app.get("/sellers", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu" });
  }
  const cacheKey = `cache:sellers:${user_id}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const result = await pool.query(
      `SELECT id, user_id, seller_name, created_at, updated_at, deleted_at
       FROM seller_db
       WHERE deleted_at IS NULL
         AND user_id = $1
       ORDER BY created_at DESC`,
      [user_id]
    );
    await setCache(cacheKey, result.rows, TTL_USER_LONG);
    return res.json(result.rows);
  } catch (error) {
    console.error("[stock-service][sellers] listeleme hatasi:", error.message);
    return res.status(500).json({ message: "saticilar listelenemedi" });
  }
});

app.post("/sellers", async (req, res) => {
  const { user_id, seller_name } = req.body || {};
  if (!user_id || !String(seller_name || "").trim()) {
    return res.status(400).json({ message: "user_id ve seller_name zorunlu" });
  }
  try {
    const result = await pool.query(
      `INSERT INTO seller_db (user_id, seller_name)
       VALUES ($1, $2)
       RETURNING id, user_id, seller_name, created_at, updated_at, deleted_at`,
      [user_id, String(seller_name).trim()]
    );
    await delCache(`cache:sellers:${user_id}`);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("[stock-service][sellers] olusturma hatasi:", error.message);
    return res.status(400).json({ message: "satici olusturulamadi", detail: error.message });
  }
});

const listStocksHandler = async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu" });
  }

  const cacheKey = `cache:stocks:${user_id}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await pool.query(
      `SELECT
        s.id,
        s.user_id,
        s.stock_name,
        s.stock_quantity,
        s.stock_alert,
        s.unit_cost,
        s.seller_id,
        s.created_at,
        c.stock_category_name,
        u.unit_name,
        sl.seller_name,
        cur.currency_name,
        cur.currency_abbreviation
      FROM stock_db s
      LEFT JOIN stock_category_db c ON c.id = s.stock_category_id
      LEFT JOIN unit_db u ON u.id = s.unit_id
      LEFT JOIN seller_db sl ON sl.id = s.seller_id
      LEFT JOIN currency_db cur ON cur.id = s.currency_id
      WHERE s.deleted_at IS NULL
        AND s.user_id = $1
      ORDER BY s.created_at DESC`,
      [user_id]
    );
    await setCache(cacheKey, result.rows, TTL_USER);
    return res.json(result.rows);
  } catch (error) {
    console.error("[stock-service][stocks] listeleme hatasi:", error.message);
    return res.status(500).json({ message: "stoklar listelenemedi" });
  }
};

app.get("/stocks", listStocksHandler);
app.get("/s", listStocksHandler);

app.post("/categories", async (req, res) => {
  const { user_id, stock_category_name, is_default = false } = req.body;
  if (!user_id || !stock_category_name) {
    return res.status(400).json({ message: "user_id ve stock_category_name zorunlu" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO stock_category_db(user_id, stock_category_name, is_default)
       VALUES($1, $2, $3)
       RETURNING id, user_id, stock_category_name, is_default, created_at`,
      [user_id, stock_category_name, is_default]
    );
    console.log("[stock-service][categories] kategori olusturuldu:", {
      id: result.rows[0].id,
      stock_category_name: result.rows[0].stock_category_name
    });
    await delCache(`cache:categories:${user_id}`);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("[stock-service][categories] kategori olusturma hatasi:", error.message);
    return res.status(400).json({ message: "kategori olusturulamadi", detail: error.message });
  }
});

app.post("/units", async (req, res) => {
  const { user_id, unit_name, is_default = false } = req.body;
  if (!user_id || !unit_name) {
    return res.status(400).json({ message: "user_id ve unit_name zorunlu" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO unit_db(user_id, unit_name, is_default)
       VALUES($1, $2, $3)
       RETURNING id, user_id, unit_name, is_default, created_at`,
      [user_id, unit_name, is_default]
    );
    console.log("[stock-service][units] birim olusturuldu:", {
      id: result.rows[0].id,
      unit_name: result.rows[0].unit_name
    });
    await delCache(`cache:units:${user_id}`);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("[stock-service][units] birim olusturma hatasi:", error.message);
    return res.status(400).json({ message: "birim olusturulamadi", detail: error.message });
  }
});

const roundMoney = (n) => Math.round(Number(n) * 10000) / 10000;

const parseMoneyInput = (raw) => {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  const num = Number(s);
  if (Number.isNaN(num)) return Number.NaN;
  return Math.round(num * 10000) / 10000;
};

const createStockHandler = async (req, res) => {
  const {
    user_id,
    stock_category_id,
    stock_name,
    stock_quantity,
    unit_id,
    unit_cost,
    seller_id,
    currency_id,
    paid_amount: paid_amount_raw
  } = req.body;

  if (
    !user_id ||
    !stock_category_id ||
    !stock_name ||
    stock_quantity === undefined ||
    !unit_id ||
    unit_cost === undefined ||
    !seller_id ||
    !currency_id
  ) {
    return res.status(400).json({ message: "Gerekli alanlar eksik." });
  }

  const parsedStockQuantity = Number(stock_quantity);
  const parsedUnitCost = Number(unit_cost);

  if (Number.isNaN(parsedStockQuantity) || Number.isNaN(parsedUnitCost)) {
    return res.status(400).json({ message: "Miktar ve maliyet sayisal olmalidir." });
  }

  const totalExpense = roundMoney(parsedStockQuantity * parsedUnitCost);
  let paidExpense = totalExpense;
  if (paid_amount_raw !== undefined && paid_amount_raw !== null && paid_amount_raw !== "") {
    const p = parseMoneyInput(paid_amount_raw);
    if (p === null || Number.isNaN(p) || p < 0) {
      return res.status(400).json({ message: "Odenen tutar gecerli bir sayi olmalidir." });
    }
    if (p > totalExpense + 1e-6) {
      return res.status(400).json({ message: "Odenen tutar toplam tutardan buyuk olamaz." });
    }
    paidExpense = p;
  }
  const remainingExpense = roundMoney(totalExpense - paidExpense);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const categoryResult = await client.query(
      `SELECT id
       FROM stock_category_db
       WHERE id = $1
         AND deleted_at IS NULL
         AND (is_default = TRUE OR user_id = $2)
       LIMIT 1`,
      [stock_category_id, user_id]
    );
    if (categoryResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Gecerli bir stok kategorisi seciniz." });
    }

    const unitResult = await client.query(
      `SELECT id
       FROM unit_db
       WHERE id = $1
         AND deleted_at IS NULL
         AND (is_default = TRUE OR user_id = $2)
       LIMIT 1`,
      [unit_id, user_id]
    );
    if (unitResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Gecerli bir birim seciniz." });
    }

    const currencyResult = await client.query(
      `SELECT id
       FROM currency_db
       WHERE id = $1
         AND deleted_at IS NULL
       LIMIT 1`,
      [currency_id]
    );
    if (currencyResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Gecerli bir para birimi seciniz." });
    }

    const sellerResult = await client.query(
      `SELECT id
       FROM seller_db
       WHERE id = $1
         AND user_id = $2
         AND deleted_at IS NULL
       LIMIT 1`,
      [seller_id, user_id]
    );
    if (sellerResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Gecerli bir satici seciniz." });
    }

    const insertResult = await client.query(
      `INSERT INTO stock_db (
        user_id,
        stock_category_id,
        stock_name,
        stock_quantity,
        unit_id,
        unit_cost,
        seller_id,
        currency_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, stock_category_id, stock_name, stock_quantity, unit_id, unit_cost, seller_id, currency_id, created_at`,
      [
        user_id,
        stock_category_id,
        stock_name.trim(),
        parsedStockQuantity,
        unit_id,
        parsedUnitCost,
        seller_id,
        currency_id
      ]
    );

    await client.query("COMMIT");
    let paymentTxId = null;
    try {
      if (paidExpense > 1e-6) {
        const txRow = await postTransaction({
          user_id,
          amount: paidExpense,
          is_income: false,
          transaction_name: `Stok alimi odemesi: ${String(stock_name).trim()}`
        });
        paymentTxId = txRow?.id || null;
      }
    } catch (txError) {
      console.error("[stock-service][stocks] transactions kaydi hatasi:", txError.message);
    }
    if (remainingExpense > 1e-6) {
      try {
        await pool.query(
          `INSERT INTO liabilities_receivables_db (
            user_id, seller_id, customer_id, transaction_id, is_paid, amount, remaining_amount, is_receivable
          ) VALUES ($1::uuid, $2::uuid, NULL, $3::uuid, FALSE, $4::numeric, $5::numeric, FALSE)`,
          [user_id, seller_id, paymentTxId, totalExpense, remainingExpense]
        );
      } catch (liabError) {
        console.error("[stock-service][stocks] borc kaydi hatasi:", liabError.message);
      }
    }
    await delCache(`cache:stocks:${user_id}`);
    return res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[stock-service][stocks] stok kaydetme hatasi:", error.message);
    return res.status(500).json({ message: "Stok kaydedilemedi." });
  } finally {
    client.release();
  }
};

app.post("/stocks", createStockHandler);
app.post("/s", createStockHandler);

const consumeStockHandler = async (req, res) => {
  const stockId = req.params.id;
  const { user_id, quantity, buyer_id, transaction_name } = req.body || {};
  if (!user_id || !stockId || quantity === undefined || !buyer_id) {
    return res.status(400).json({ message: "user_id, stock_id, quantity ve buyer_id zorunlu." });
  }
  const parsedQty = Number(quantity);
  if (Number.isNaN(parsedQty) || parsedQty <= 0) {
    return res.status(400).json({ message: "quantity sifirdan buyuk sayi olmali." });
  }

  const client = await pool.connect();
  let expenseAmount = 0;
  try {
    await client.query("BEGIN");
    const stockResult = await client.query(
      `SELECT id, stock_name, stock_quantity, unit_cost
       FROM stock_db
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [stockId, user_id]
    );
    if (stockResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Stok bulunamadi." });
    }
    const stock = stockResult.rows[0];
    const currentQty = Number(stock.stock_quantity);
    if (currentQty + 1e-9 < parsedQty) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Stok yetersiz." });
    }
    expenseAmount = parsedQty * Number(stock.unit_cost);
    await client.query(
      `UPDATE stock_db
       SET stock_quantity = stock_quantity - $1::numeric,
           updated_at = NOW()
       WHERE id = $2::uuid AND user_id = $3::uuid AND deleted_at IS NULL`,
      [parsedQty, stockId, user_id]
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_rb) {
      /* noop */
    }
    return res.status(400).json({ message: "Stoktan dusme basarisiz.", detail: error.message });
  } finally {
    client.release();
  }

  try {
    await postTransaction({
      user_id,
      amount: expenseAmount,
      is_income: false,
      buyer_id,
      transaction_name: transaction_name || null
    });
  } catch (txError) {
    console.error("[stock-service][consume] transactions kaydi hatasi:", txError.message);
  }
  await delCache(`cache:stocks:${user_id}`);
  return res.json({ ok: true, stock_id: stockId, quantity: parsedQty, amount: expenseAmount });
};

const updateStockHandler = async (req, res) => {
  const stockId = req.params.id;
  const { user_id, stock_name, stock_quantity, unit_cost, stock_alert: stock_alert_raw } = req.body || {};

  if (!user_id || !stockId) {
    return res.status(400).json({ message: "user_id ve stok id zorunlu." });
  }

  try {
    const existingResult = await pool.query(
      `SELECT id, stock_name, stock_quantity, unit_cost, stock_alert
       FROM stock_db
       WHERE id = $1::uuid AND user_id = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [stockId, user_id]
    );

    if (existingResult.rowCount === 0) {
      return res.status(404).json({ message: "Stok bulunamadi." });
    }

    const current = existingResult.rows[0];
    const nextName =
      stock_name !== undefined && String(stock_name).trim() !== ""
        ? String(stock_name).trim()
        : current.stock_name;
    const nextQty = stock_quantity !== undefined ? Number(stock_quantity) : Number(current.stock_quantity);
    const nextCost = unit_cost !== undefined ? Number(unit_cost) : Number(current.unit_cost);

    if (Number.isNaN(nextQty) || Number.isNaN(nextCost) || nextQty < 0 || nextCost < 0) {
      return res.status(400).json({ message: "Miktar ve maliyet gecerli sayi olmali (0 veya buyuk)." });
    }

    const hasAlertField = Object.prototype.hasOwnProperty.call(req.body || {}, "stock_alert");
    let nextAlert = current.stock_alert;
    if (hasAlertField) {
      if (stock_alert_raw === null || stock_alert_raw === "") {
        nextAlert = null;
      } else {
        const parsedAlert = Number(stock_alert_raw);
        if (Number.isNaN(parsedAlert) || parsedAlert < 0) {
          return res.status(400).json({ message: "stock_alert gecerli bir sayi olmali (0 veya buyuk)." });
        }
        nextAlert = parsedAlert;
      }
    }

    const updateResult = await pool.query(
      `UPDATE stock_db
       SET stock_name = $1,
           stock_quantity = $2::numeric,
           unit_cost = $3::numeric,
           stock_alert = $4::numeric,
           updated_at = NOW()
       WHERE id = $5::uuid AND user_id = $6 AND deleted_at IS NULL
       RETURNING id, user_id, stock_name, stock_quantity, stock_alert, unit_cost, updated_at`,
      [nextName, nextQty, nextCost, nextAlert, stockId, user_id]
    );

    await delCache(`cache:stocks:${user_id}`);
    return res.json(updateResult.rows[0]);
  } catch (error) {
    console.error("[stock-service][stocks] stok guncelleme hatasi:", error.message);
    return res.status(400).json({ message: "Stok guncellenemedi.", detail: error.message });
  }
};

const deleteStockHandler = async (req, res) => {
  const stockId = req.params.id;
  const { user_id } = req.body || {};

  if (!user_id || !stockId) {
    return res.status(400).json({ message: "user_id ve stok id zorunlu." });
  }

  try {
    const deleteResult = await pool.query(
      `UPDATE stock_db
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [stockId, user_id]
    );
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ message: "Stok bulunamadi." });
    }
    await delCache(`cache:stocks:${user_id}`);
    return res.json({ ok: true, message: "Stok silindi." });
  } catch (error) {
    console.error("[stock-service][stocks] stok silme hatasi:", error.message);
    return res.status(400).json({ message: "Stok silinemedi.", detail: error.message });
  }
};

app.patch("/stocks/:id", updateStockHandler);
app.patch("/s/:id", updateStockHandler);
app.delete("/stocks/:id", deleteStockHandler);
app.delete("/s/:id", deleteStockHandler);
app.post("/stocks/:id/consume", consumeStockHandler);

app.post("/items", async (req, res) => {
  const { name, quantity = 0, unit = "adet" } = req.body;
  if (!name) {
    return res.status(400).json({ message: "name zorunlu" });
  }

  const result = await pool.query(
    "INSERT INTO stock_items(name, quantity, unit) VALUES($1, $2, $3) RETURNING *",
    [name, quantity, unit]
  );
  return res.status(201).json(result.rows[0]);
});

const start = async () => {
  await initStockDatabase(pool);
  app.listen(port, () => {
    console.log(`Stock service running on ${port}`);
  });
};

start().catch((error) => {
  console.error("[stock-service] Baslatilamadi:", error.message);
  process.exit(1);
});
