const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createPool, initCustomerDatabase } = require("../database/database");
const { getCache, setCache, delCache } = require("./cache");

const TTL_GLOBAL = 3600; // cities
const TTL_USER = 30;     // customers

// Bir kullanicinin tum musteri cache varyantlarini sil (is_done filtresiz/filtreli)
const delCustomerCache = (user_id) =>
  delCache(
    `cache:customers:${user_id}:all`,
    `cache:customers:${user_id}:true`,
    `cache:customers:${user_id}:false`
  );

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

const CUSTOMER_SELECT = `
  c.id,
  c.user_id,
  c.customer_name,
  c.customer_phone,
  c.customer_company_name,
  c.customer_id_number,
  c.current_name,
  c.customer_city,
  c.customer_district,
  c.customer_address,
  ct.city_name AS customer_city_name,
  c.is_done,
  c.recipe_completed_at,
  c.created_at,
  c.updated_at,
  c.deleted_at
`;

const resolveCustomerCityId = async (cityId) => {
  if (cityId == null || cityId === "") return null;
  const id = String(cityId).trim();
  if (!id) return null;
  const check = await pool.query(
    `SELECT id FROM cities_db WHERE id = $1::uuid AND deleted_at IS NULL`,
    [id]
  );
  if (check.rowCount === 0) {
    const err = new Error("Gecersiz sehir secimi.");
    err.statusCode = 400;
    throw err;
  }
  return id;
};

const listCitiesHandler = async (_req, res) => {
  const cacheKey = "cache:cities";
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const result = await pool.query(
      `SELECT id, city_name, created_at, updated_at, deleted_at
       FROM cities_db
       WHERE deleted_at IS NULL
       ORDER BY city_name ASC`
    );
    await setCache(cacheKey, result.rows, TTL_GLOBAL);
    return res.json(result.rows);
  } catch (error) {
    console.error("[customer-service][cities] liste hatasi:", error.message);
    return res.status(500).json({ message: "Sehirler listelenemedi." });
  }
};

app.get("/cities", listCitiesHandler);
app.get("/customer/cities", listCitiesHandler);

app.get("/customers", async (req, res) => {
  const { user_id, is_done } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu." });
  }

  const doneFilterOn = is_done === "true" || is_done === "false";
  const doneFilterValue = is_done === "true";
  const cacheVariant = doneFilterOn ? String(doneFilterValue) : "all";
  const cacheKey = `cache:customers:${user_id}:${cacheVariant}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await pool.query(
      `SELECT ${CUSTOMER_SELECT}
       FROM customers_db c
       LEFT JOIN cities_db ct ON ct.id = c.customer_city AND ct.deleted_at IS NULL
       WHERE c.user_id = $1
         AND c.deleted_at IS NULL
         AND ($2::boolean = FALSE OR c.is_done = $3::boolean)
       ORDER BY c.created_at DESC`,
      [user_id, doneFilterOn, doneFilterValue]
    );
    await setCache(cacheKey, result.rows, TTL_USER);
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
    customer_company_name,
    customer_city,
    customer_district,
    customer_address
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
    const cityId = await resolveCustomerCityId(customer_city);
    const result = await pool.query(
      `INSERT INTO customers_db (
         user_id, customer_name, customer_phone, customer_company_name,
         customer_id_number, current_name, customer_city, customer_district, customer_address, is_done
       )
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8, $9, FALSE)
       RETURNING id`,
      [
        user_id,
        name,
        opt(customer_phone),
        opt(customer_company_name),
        opt(customer_id_number),
        opt(current_name),
        cityId,
        opt(customer_district),
        opt(customer_address)
      ]
    );
    const insertedId = result.rows[0].id;
    const fullRow = await pool.query(
      `SELECT ${CUSTOMER_SELECT}
       FROM customers_db c
       LEFT JOIN cities_db ct ON ct.id = c.customer_city AND ct.deleted_at IS NULL
       WHERE c.id = $1::uuid`,
      [insertedId]
    );
    const row = fullRow.rows[0];
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
    await delCustomerCache(user_id);
    return res.status(201).json(row);
  } catch (error) {
    console.error("[customer-service][customers] kayit hatasi:", error.message);
    const status = error.statusCode || 400;
    return res.status(status).json({ message: error.message || "Musteri kaydedilemedi.", detail: error.message });
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
    customer_company_name,
    customer_city,
    customer_district,
    customer_address
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
    const cityId = await resolveCustomerCityId(customer_city);
    const result = await pool.query(
      `UPDATE customers_db
       SET customer_name = $1,
           customer_phone = $2,
           customer_company_name = $3,
           customer_id_number = $4,
           current_name = $5,
           customer_city = $6::uuid,
           customer_district = $7,
           customer_address = $8,
           updated_at = NOW()
       WHERE id = $9::uuid
         AND user_id = $10::uuid
         AND deleted_at IS NULL
       RETURNING id`,
      [
        name,
        opt(customer_phone),
        opt(customer_company_name),
        opt(customer_id_number),
        opt(current_name),
        cityId,
        opt(customer_district),
        opt(customer_address),
        customerId,
        user_id
      ]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Musteri bulunamadi." });
    }
    const fullRow = await pool.query(
      `SELECT ${CUSTOMER_SELECT}
       FROM customers_db c
       LEFT JOIN cities_db ct ON ct.id = c.customer_city AND ct.deleted_at IS NULL
       WHERE c.id = $1::uuid`,
      [customerId]
    );
    await delCustomerCache(user_id);
    return res.json(fullRow.rows[0]);
  } catch (error) {
    console.error("[customer-service][customers] guncelleme hatasi:", error.message);
    const status = error.statusCode || 400;
    return res.status(status).json({ message: error.message || "Musteri guncellenemedi.", detail: error.message });
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
       RETURNING id`,
      [is_done, customerId, user_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Musteri bulunamadi." });
    }
    const fullRow = await pool.query(
      `SELECT ${CUSTOMER_SELECT}
       FROM customers_db c
       LEFT JOIN cities_db ct ON ct.id = c.customer_city AND ct.deleted_at IS NULL
       WHERE c.id = $1::uuid`,
      [customerId]
    );
    await delCustomerCache(user_id);
    return res.json(fullRow.rows[0]);
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
    await delCustomerCache(user_id);
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
