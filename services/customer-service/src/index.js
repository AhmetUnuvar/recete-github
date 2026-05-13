const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createPool, initCustomerDatabase } = require("../database/database");

const app = express();
const port = process.env.PORT || 4007;
const pool = createPool();
const financeServiceBase = (process.env.FINANCE_SERVICE_URL || "http://localhost:4003").replace(/\/$/, "");

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "customer-service", ok: true });
});

app.get("/customers", async (req, res) => {
  const { user_id, is_done } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu." });
  }
  try {
    const doneFilterOn = is_done === "true" || is_done === "false";
    const doneFilterValue = is_done === "true";
    const result = await pool.query(
      `SELECT id, user_id, customer_name, customer_phone, customer_company_name,
              customer_id_number, current_name, is_done, recipe_completed_at, created_at, updated_at, deleted_at
       FROM customers_db
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND ($2::boolean = FALSE OR is_done = $3::boolean)
       ORDER BY created_at DESC`,
      [user_id, doneFilterOn, doneFilterValue]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("[customer-service][customers] liste hatasi:", error.message);
    return res.status(500).json({ message: "Musteriler listelenemedi." });
  }
});

app.post("/customers", async (req, res) => {
  const {
    user_id,
    customer_name,
    customer_id_number,
    customer_phone,
    current_name,
    customer_company_name
  } = req.body || {};

  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu." });
  }
  const name = typeof customer_name === "string" ? customer_name.trim() : "";
  if (!name) {
    return res.status(400).json({ message: "Musteri adi zorunlu." });
  }

  const opt = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  try {
    const result = await pool.query(
      `INSERT INTO customers_db (
         user_id, customer_name, customer_phone, customer_company_name,
         customer_id_number, current_name, is_done
       )
       VALUES ($1::uuid, $2, $3, $4, $5, $6, FALSE)
       RETURNING id, user_id, customer_name, customer_phone, customer_company_name,
                customer_id_number, current_name, is_done, recipe_completed_at, created_at, updated_at, deleted_at`,
      [
        user_id,
        name,
        opt(customer_phone),
        opt(customer_company_name),
        opt(customer_id_number),
        opt(current_name)
      ]
    );
    const row = result.rows[0];
    try {
      const fr = await fetch(`${financeServiceBase}/customer-fixed-expense-shares/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id, customer_id: row.id })
      });
      if (!fr.ok) {
        const txt = await fr.text().catch(() => "");
        console.error(
          "[customer-service][customers] sabit gider bootstrap basarisiz:",
          fr.status,
          txt
        );
      }
    } catch (fe) {
      console.error("[customer-service][customers] sabit gider bootstrap hatasi:", fe.message);
    }
    return res.status(201).json(row);
  } catch (error) {
    console.error("[customer-service][customers] kayit hatasi:", error.message);
    return res.status(400).json({ message: "Musteri kaydedilemedi.", detail: error.message });
  }
});

app.patch("/customers/:id", async (req, res) => {
  const customerId = req.params.id;
  const {
    user_id,
    customer_name,
    customer_id_number,
    customer_phone,
    current_name,
    customer_company_name
  } = req.body || {};

  if (!user_id || !customerId) {
    return res.status(400).json({ message: "user_id ve customer id zorunlu." });
  }
  const name = typeof customer_name === "string" ? customer_name.trim() : "";
  if (!name) {
    return res.status(400).json({ message: "Musteri adi zorunlu." });
  }

  const opt = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  try {
    const result = await pool.query(
      `UPDATE customers_db
       SET customer_name = $1,
           customer_phone = $2,
           customer_company_name = $3,
           customer_id_number = $4,
           current_name = $5,
           updated_at = NOW()
       WHERE id = $6::uuid
         AND user_id = $7::uuid
         AND deleted_at IS NULL
       RETURNING id, user_id, customer_name, customer_phone, customer_company_name,
                customer_id_number, current_name, is_done, recipe_completed_at, created_at, updated_at, deleted_at`,
      [
        name,
        opt(customer_phone),
        opt(customer_company_name),
        opt(customer_id_number),
        opt(current_name),
        customerId,
        user_id
      ]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Musteri bulunamadi." });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("[customer-service][customers] guncelleme hatasi:", error.message);
    return res.status(400).json({ message: "Musteri guncellenemedi.", detail: error.message });
  }
});

app.patch("/customers/:id/done", async (req, res) => {
  const customerId = req.params.id;
  const { user_id, is_done } = req.body || {};
  if (!user_id || !customerId || typeof is_done !== "boolean") {
    return res.status(400).json({ message: "user_id, customer id ve is_done zorunlu." });
  }
  try {
    const result = await pool.query(
      `UPDATE customers_db
       SET is_done = $1,
           recipe_completed_at = CASE
             WHEN $1::boolean = TRUE THEN COALESCE(recipe_completed_at, NOW())
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE id = $2::uuid
         AND user_id = $3::uuid
         AND deleted_at IS NULL
       RETURNING id, user_id, customer_name, customer_phone, customer_company_name,
                customer_id_number, current_name, is_done, recipe_completed_at, created_at, updated_at, deleted_at`,
      [is_done, customerId, user_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Musteri bulunamadi." });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("[customer-service][customers] is_done guncelleme hatasi:", error.message);
    return res.status(400).json({ message: "Musteri durumu guncellenemedi.", detail: error.message });
  }
});

app.delete("/customers/:id", async (req, res) => {
  const customerId = req.params.id;
  const { user_id } = req.body || {};
  if (!user_id || !customerId) {
    return res.status(400).json({ message: "user_id ve customer id zorunlu." });
  }
  try {
    const result = await pool.query(
      `UPDATE customers_db
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND deleted_at IS NULL
       RETURNING id`,
      [customerId, user_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Musteri bulunamadi." });
    }
    return res.json({ ok: true, message: "Musteri silindi." });
  } catch (error) {
    console.error("[customer-service][customers] silme hatasi:", error.message);
    return res.status(400).json({ message: "Musteri silinemedi.", detail: error.message });
  }
});

const start = async () => {
  await initCustomerDatabase(pool);
  app.listen(port, () => {
    console.log(`Customer service running on ${port}`);
  });
};

start().catch((error) => {
  console.error("[customer-service] Baslatilamadi:", error.message);
  process.exit(1);
});
