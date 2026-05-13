const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createPool, initProductDatabase } = require("../database/database");

const app = express();
const port = process.env.PORT || 4004;
const pool = createPool();
const transactionsServiceBase = (process.env.TRANSACTIONS_SERVICE_URL || "http://localhost:4006").replace(/\/$/, "");
const recipeCacheByProductId = new Map();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

const calcRecipeCostRemote = async (lines) => {
  const base = (process.env.CALC_SERVICE_URL || "http://localhost:4005").replace(/\/$/, "");
  const response = await fetch(`${base}/recipe-cost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines })
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_e) {
    body = { message: text || "calc parse hatasi" };
  }
  if (!response.ok) {
    const msg = body.message || `calc-service ${response.status}`;
    const err = new Error(msg);
    err.line_index = body.line_index;
    throw err;
  }
  return body;
};

const roundMoney = (n) => Math.round(Number(n) * 10000) / 10000;

const parseMoneyInput = (raw) => {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  const num = Number(s);
  if (Number.isNaN(num)) return Number.NaN;
  return Math.round(num * 10000) / 10000;
};

const postTransaction = async ({
  user_id,
  amount,
  is_income,
  is_fixed = false,
  buyer_id = null,
  product_id = null,
  transaction_name = null
}) => {
  const parsedAmount = Number(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) return null;
  const response = await fetch(`${transactionsServiceBase}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id,
      amount: parsedAmount,
      is_income,
      is_fixed: Boolean(is_fixed),
      buyer_id,
      product_id,
      transaction_name
    })
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

const buildRawLines = (materials, stock_id) => {
  let rawLines = [];
  if (Array.isArray(materials) && materials.length > 0) {
    for (const m of materials) {
      const sid = m.stock_id;
      const qty = Number(m.quantity);
      if (!sid || typeof sid !== "string") continue;
      if (Number.isNaN(qty) || qty <= 0) {
        const err = new Error("Her malzeme icin pozitif miktar (quantity) zorunlu.");
        err.status = 400;
        throw err;
      }
      const qu = m.quantity_unit != null ? String(m.quantity_unit).trim() : "";
      rawLines.push({
        stock_id: sid,
        quantity: qty,
        quantity_unit: qu || null
      });
    }
  }
  if (rawLines.length === 0 && Array.isArray(stock_id) && stock_id.length > 0) {
    const ids = [...new Set(stock_id.filter((id) => typeof id === "string" && id.length > 0))];
    rawLines = ids.map((id) => ({ stock_id: id, quantity: 1, quantity_unit: null }));
  }
  return rawLines;
};

const computeRecipeEnvelope = async ({ user_id, rawLines }) => {
  const uniqueIds = [...new Set(rawLines.map((l) => l.stock_id))];
  const stockResult = await pool.query(
    `SELECT s.id, s.stock_name, s.stock_quantity, s.unit_cost, u.unit_name AS stock_unit_name
     FROM stock_db s
     INNER JOIN unit_db u ON u.id = s.unit_id
     WHERE s.deleted_at IS NULL
       AND s.user_id = $1
       AND s.id = ANY($2::uuid[])`,
    [user_id, uniqueIds]
  );

  if (stockResult.rowCount !== uniqueIds.length) {
    const err = new Error("Bazi stok id leri bulunamadi, birimi eksik veya bu kullaniciya ait degil.");
    err.status = 400;
    throw err;
  }

  const byId = new Map(stockResult.rows.map((row) => [String(row.id), row]));
  const calcInput = rawLines.map((line) => {
    const row = byId.get(String(line.stock_id));
    const stockUnit = (row.stock_unit_name || "").trim();
    const qu =
      line.quantity_unit && line.quantity_unit.length > 0 ? line.quantity_unit.trim() : stockUnit;
    return {
      stock_id: line.stock_id,
      unit_cost: row.unit_cost,
      stock_unit: stockUnit,
      quantity: line.quantity,
      quantity_unit: qu
    };
  });
  return calcRecipeCostRemote(calcInput);
};

/** Takvim ayi = 30 gun x 24 saat; saatlik sabit = aylik / bu deger (sabit gelir dahil degil). */
const CALENDAR_HOURS_PER_MONTH = 30 * 24;

const computeFixedNetForHours = async ({ user_id, total_hours }) => {
  const h = Number(total_hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  const result = await pool.query(
    `SELECT amount::numeric AS amount
     FROM fixed_db
     WHERE user_id = $1::uuid
       AND deleted_at IS NULL
       AND is_fixed_income = FALSE`,
    [user_id]
  );
  let sum = 0;
  for (const row of result.rows) {
    const monthly = Number(row.amount);
    if (!Number.isFinite(monthly) || monthly <= 0) continue;
    sum += (monthly / CALENDAR_HOURS_PER_MONTH) * h;
  }
  return roundMoney(sum);
};

const parseTotalHoursInput = (body) => {
  const rawH = body?.total_hours;
  if (rawH !== undefined && rawH !== null && rawH !== "") {
    const h = Number(rawH);
    if (Number.isFinite(h) && h >= 0) return h;
    return Number.NaN;
  }
  const legacyDays = Number(body?.total_days);
  if (Number.isFinite(legacyDays) && legacyDays > 0 && Number.isInteger(legacyDays)) {
    return legacyDays * 24;
  }
  return Number.NaN;
};

const legacyTotalDaysFromHours = (hours) => {
  const h = Number(hours);
  if (!Number.isFinite(h) || h < 0) return 1;
  if (h === 0) return 0;
  return Math.max(1, Math.ceil(h / 24));
};

app.get("/health", (_req, res) => {
  res.json({ service: "product-service", ok: true });
});

app.get("/owned-products", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu." });
  }

  try {
    const result = await pool.query(
      `SELECT
         p.id AS product_id,
         p.product_name,
         p.price,
         COUNT(o.id)::integer AS adet,
         MAX(o.created_at) AS last_produced_at
       FROM owned_product_db o
       INNER JOIN product_db p
         ON p.id = o.product_id
        AND p.user_id = o.user_id
        AND p.deleted_at IS NULL
       WHERE o.user_id = $1
         AND o.deleted_at IS NULL
       GROUP BY p.id, p.product_name, p.price
       ORDER BY MAX(o.created_at) DESC`,
      [user_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("[product-service][owned-products] liste hatasi:", error.message);
    return res.status(500).json({ message: "Uretilen urunler listelenemedi." });
  }
});

app.post("/owned-products/:product_id/sell", async (req, res) => {
  const productId = req.params.product_id;
  const { user_id, buyer_id, received_amount: received_raw } = req.body || {};
  if (!user_id || !productId || !buyer_id) {
    return res.status(400).json({ message: "user_id, product_id ve buyer_id zorunlu." });
  }

  const client = await pool.connect();
  let soldPrice = 0;
  let soldProfit = 0;
  let productionCost = 0;
  let soldProductName = "";
  let collected = 0;
  let remainder = 0;
  try {
    await client.query("BEGIN");

    const productResult = await client.query(
      `SELECT id, price, product_name, material_cost_total, cost
       FROM product_db
       WHERE id = $1::uuid AND user_id = $2 AND deleted_at IS NULL`,
      [productId, user_id]
    );
    if (productResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Urun bulunamadi." });
    }
    const prow = productResult.rows[0];
    soldPrice = Number(prow.price) || 0;
    soldProductName = String(prow.product_name || "").trim();
    const matRaw = prow.material_cost_total;
    const cstRaw = prow.cost;
    const mat = matRaw == null ? NaN : Number(matRaw);
    const cst = cstRaw == null ? NaN : Number(cstRaw);
    /** Toplam uretim maliyeti: malzeme + sabit gider payi (`cost`); yoksa sadece malzeme. */
    productionCost =
      !Number.isNaN(cst) && cst >= 0 ? cst : !Number.isNaN(mat) && mat >= 0 ? mat : 0;
    if (soldPrice <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Bu urun icin gecerli satis fiyati yok." });
    }
    soldProfit = Math.round((soldPrice - productionCost) * 10000) / 10000;
    if (!(soldProfit > 0)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message:
          "Satis karı sifirdan buyuk olmali. Satis fiyati, toplam uretim maliyetinden (malzeme + sabit gider payi) buyuk olmalidir."
      });
    }

    collected = soldPrice;
    if (received_raw !== undefined && received_raw !== null && received_raw !== "") {
      const r = parseMoneyInput(received_raw);
      if (r === null || Number.isNaN(r) || r < 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Tahsil ettiginiz tutar gecerli bir sayi olmalidir." });
      }
      if (r > soldPrice + 1e-6) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Tahsil ettiginiz tutar satis fiyatindan buyuk olamaz." });
      }
      collected = r;
    }
    remainder = roundMoney(soldPrice - collected);

    const ownedToSell = await client.query(
      `SELECT id
       FROM owned_product_db
       WHERE product_id = $1::uuid
         AND user_id = $2
         AND deleted_at IS NULL
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [productId, user_id]
    );
    if (ownedToSell.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Satilacak urun adedi yok." });
    }

    const buyerResult = await client.query(
      `SELECT id
       FROM customers_db
       WHERE id = $1::uuid
         AND user_id = $2::uuid
         AND deleted_at IS NULL`,
      [buyer_id, user_id]
    );
    if (buyerResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Secilen musteri bulunamadi." });
    }

    await client.query(
      `UPDATE owned_product_db
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1::uuid`,
      [ownedToSell.rows[0].id]
    );

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_rb) {
      /* noop */
    }
    return res.status(400).json({ message: "Satis islemi basarisiz.", detail: error.message });
  } finally {
    client.release();
  }

  /**
   * transactions_db: uretim maliyeti gider + satis fiyati gelir (kar burada yazilmaz).
   * profit_db: satis karı (aynı Postgres; calc-service migration ile profit_db.customer_id vb.).
   */
  let incomeTxId = null;
  try {
    if (productionCost > 1e-6) {
      await postTransaction({
        user_id,
        amount: productionCost,
        is_income: false,
        is_fixed: false,
        buyer_id,
        product_id: productId,
        transaction_name: soldProductName
          ? `${soldProductName} uretim maliyeti`
          : "Urun uretim maliyeti"
      });
    }
    const incomeRow = await postTransaction({
      user_id,
      amount: soldPrice,
      is_income: true,
      is_fixed: false,
      buyer_id,
      product_id: productId,
      transaction_name: soldProductName ? `${soldProductName} satis geliri` : "Urun satis geliri"
    });
    incomeTxId = incomeRow?.id || null;

    if (soldProfit > 1e-6 && incomeTxId) {
      await pool.query(
        `INSERT INTO profit_db (user_id, transaction_id, product_id, customer_id, profit_amount)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric)`,
        [user_id, incomeTxId, productId, buyer_id, soldProfit]
      );
    }
  } catch (txError) {
    console.error("[product-service][sell] transactions/profit_db kaydi hatasi:", txError.message);
  }

  if (remainder > 1e-6) {
    try {
      await pool.query(
        `INSERT INTO liabilities_receivables_db (
          user_id, seller_id, customer_id, transaction_id, is_paid, amount, remaining_amount, is_receivable
        ) VALUES ($1::uuid, NULL, $2::uuid, $3::uuid, FALSE, $4::numeric, $5::numeric, TRUE)`,
        [user_id, buyer_id, incomeTxId, soldPrice, remainder]
      );
    } catch (liabError) {
      console.error("[product-service][sell] alacak kaydi hatasi:", liabError.message);
    }
  }

  return res.json({
    ok: true,
    product_id: productId,
    sale_price: soldPrice,
    production_cost: productionCost,
    profit: soldProfit,
    buyer_id,
    collected_amount: collected,
    remainder_receivable: remainder
  });
});

app.get("/products", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu." });
  }

  try {
    const result = await pool.query(
      `SELECT id, user_id, stock_id, product_name, total_days, total_hours, material_cost_total, cost, price, created_at, updated_at, deleted_at
       FROM product_db
       WHERE deleted_at IS NULL AND user_id = $1
       ORDER BY created_at DESC`,
      [user_id]
    );
    const out = result.rows.map((row) => {
      const pid = String(row.id);
      const cached = recipeCacheByProductId.get(pid);
      return { ...row, materials: Array.isArray(cached) ? cached : [] };
    });
    return res.json(out);
  } catch (error) {
    console.error("[product-service][products] liste hatasi:", error.message);
    return res.status(500).json({ message: "Urunler listelenemedi." });
  }
});

app.post("/products", async (req, res) => {
  const { user_id, product_name, materials, stock_id, price } = req.body;

  if (!user_id || !product_name?.trim()) {
    return res.status(400).json({ message: "user_id ve product_name zorunlu." });
  }

  let rawLines = [];
  try {
    rawLines = buildRawLines(materials, stock_id);
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }

  if (rawLines.length === 0) {
    return res.status(400).json({
      message: "materials (stock_id, quantity, quantity_unit?) veya stock_id dizisi zorunlu."
    });
  }

  try {
    const uniqueIds = [...new Set(rawLines.map((l) => l.stock_id))];
    const parsedPrice = price === undefined ? 0 : Number(price);
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: "price gecerli bir sayi olmali (0 veya buyuk)." });
    }
    const parsedTotalHours = parseTotalHoursInput(req.body);
    if (!Number.isFinite(parsedTotalHours) || parsedTotalHours < 0) {
      return res.status(400).json({ message: "total_hours gecerli bir sayi olmali (0 veya buyuk)." });
    }
    const legacyDaysForRow = legacyTotalDaysFromHours(parsedTotalHours);
    let calcResult;
    try {
      calcResult = await computeRecipeEnvelope({ user_id, rawLines });
    } catch (calcErr) {
      return res.status(400).json({
        message: calcErr.message || "Maliyet hesaplanamadi.",
        line_index: calcErr.line_index
      });
    }

    const client = await pool.connect();
    let insert;
    try {
      await client.query("BEGIN");
      const fixedNet = await computeFixedNetForHours({ user_id, total_hours: parsedTotalHours });
      const totalCost = roundMoney(Number(calcResult.total_cost || 0) + fixedNet);
      insert = await client.query(
        `INSERT INTO product_db (user_id, stock_id, product_name, total_days, total_hours, material_cost_total, cost, price)
         VALUES ($1, $2::uuid[], $3, $4::int, $5::numeric, $6::numeric, $7::numeric, $8::numeric)
         RETURNING id, user_id, stock_id, product_name, total_days, total_hours, material_cost_total, cost, price, created_at, updated_at, deleted_at`,
        [
          user_id,
          uniqueIds,
          product_name.trim(),
          legacyDaysForRow,
          roundMoney(parsedTotalHours),
          calcResult.total_cost,
          totalCost,
          parsedPrice
        ]
      );
      await client.query("COMMIT");
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch (_rb) {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }

    console.log("[product-service][products] urun kaydedildi (stok henuz dusmedi):", {
      id: insert.rows[0].id,
      product_name: insert.rows[0].product_name,
      cost: insert.rows[0].cost
    });

    recipeCacheByProductId.set(String(insert.rows[0].id), calcResult.lines || []);

    return res.status(201).json({
      ...insert.rows[0],
      materials: calcResult.lines || []
    });
  } catch (error) {
    console.error("[product-service][products] kayit hatasi:", error.message);
    return res.status(400).json({ message: "Urun kaydedilemedi.", detail: error.message });
  }
});

app.patch("/products/:id", async (req, res) => {
  const productId = req.params.id;
  const { user_id, product_name, materials, stock_id } = req.body || {};

  if (!user_id || !productId || !product_name?.trim()) {
    return res.status(400).json({ message: "user_id, product id ve product_name zorunlu." });
  }

  let rawLines = [];
  try {
    rawLines = buildRawLines(materials, stock_id);
  } catch (error) {
    return res.status(error.status || 400).json({ message: error.message });
  }
  if (rawLines.length === 0) {
    return res.status(400).json({
      message: "materials (stock_id, quantity, quantity_unit?) veya stock_id dizisi zorunlu."
    });
  }

  try {
    const exists = await pool.query(
      `SELECT id FROM product_db WHERE id = $1::uuid AND user_id = $2 AND deleted_at IS NULL`,
      [productId, user_id]
    );
    if (exists.rowCount === 0) {
      return res.status(404).json({ message: "Urun bulunamadi." });
    }

    const uniqueIds = [...new Set(rawLines.map((l) => l.stock_id))];
    const parsedTotalHours = parseTotalHoursInput(req.body);
    if (!Number.isFinite(parsedTotalHours) || parsedTotalHours < 0) {
      return res.status(400).json({ message: "total_hours gecerli bir sayi olmali (0 veya buyuk)." });
    }
    const legacyDaysForRow = legacyTotalDaysFromHours(parsedTotalHours);
    const calcResult = await computeRecipeEnvelope({ user_id, rawLines });
    const client = await pool.connect();
    let updated;
    try {
      await client.query("BEGIN");
      const fixedNet = await computeFixedNetForHours({ user_id, total_hours: parsedTotalHours });
      const totalCost = roundMoney(Number(calcResult.total_cost || 0) + fixedNet);
      updated = await client.query(
        `UPDATE product_db
         SET product_name = $1,
             stock_id = $2::uuid[],
             total_days = $3::int,
             total_hours = $4::numeric,
             material_cost_total = $5::numeric,
             cost = $6::numeric,
             updated_at = NOW()
         WHERE id = $7::uuid AND user_id = $8 AND deleted_at IS NULL
         RETURNING id, user_id, stock_id, product_name, total_days, total_hours, material_cost_total, cost, price, created_at, updated_at, deleted_at`,
        [
          product_name.trim(),
          uniqueIds,
          legacyDaysForRow,
          roundMoney(parsedTotalHours),
          calcResult.total_cost,
          totalCost,
          productId,
          user_id
        ]
      );
      await client.query("COMMIT");
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch (_rb) {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
    recipeCacheByProductId.set(String(productId), calcResult.lines || []);
    return res.json({
      ...updated.rows[0],
      materials: calcResult.lines || []
    });
  } catch (error) {
    return res.status(400).json({ message: "Urun guncellenemedi.", detail: error.message });
  }
});

app.delete("/products/:id", async (req, res) => {
  const productId = req.params.id;
  const { user_id } = req.body || {};
  if (!user_id || !productId) {
    return res.status(400).json({ message: "user_id ve product id zorunlu." });
  }
  try {
    const deleted = await pool.query(
      `UPDATE product_db
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1::uuid AND user_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [productId, user_id]
    );
    if (deleted.rowCount === 0) {
      return res.status(404).json({ message: "Urun bulunamadi." });
    }
    recipeCacheByProductId.delete(String(productId));
    await pool.query(
      `UPDATE owned_product_db
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE product_id = $1::uuid AND user_id = $2 AND deleted_at IS NULL`,
      [productId, user_id]
    );
    return res.json({ ok: true, message: "Urun silindi." });
  } catch (error) {
    return res.status(400).json({ message: "Urun silinemedi.", detail: error.message });
  }
});

app.post("/products/:id/produce", async (req, res) => {
  const productId = req.params.id;
  const { user_id } = req.body || {};

  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu." });
  }
  if (!productId || typeof productId !== "string") {
    return res.status(400).json({ message: "Urun id gerekli." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const pRes = await client.query(
      `SELECT id, product_name, stock_id
       FROM product_db
       WHERE id = $1::uuid AND user_id = $2 AND deleted_at IS NULL`,
      [productId, user_id]
    );

    if (pRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Urun bulunamadi." });
    }

    const needBySid = new Map();
    const cachedLines = recipeCacheByProductId.get(String(productId));
    if (Array.isArray(cachedLines) && cachedLines.length > 0) {
      for (const ln of cachedLines) {
        const sid = ln?.stock_id != null ? String(ln.stock_id) : "";
        const qtyRaw =
          ln?.qty_in_stock_units !== undefined && ln?.qty_in_stock_units !== null
            ? Number(ln.qty_in_stock_units)
            : Number(ln?.quantity);
        const qty = Number.isNaN(qtyRaw) || qtyRaw <= 0 ? 0 : qtyRaw;
        if (!sid || qty <= 0) continue;
        needBySid.set(sid, (needBySid.get(sid) || 0) + qty);
      }
    } else {
      const stockIds = Array.isArray(pRes.rows[0].stock_id) ? pRes.rows[0].stock_id : [];
      for (const sidRaw of stockIds) {
        const sid = sidRaw != null ? String(sidRaw) : "";
        if (!sid) continue;
        needBySid.set(sid, (needBySid.get(sid) || 0) + 1);
      }
    }

    if (needBySid.size === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Bu urunde uretilecek malzeme yok." });
    }

    const uniqueIds = [...needBySid.keys()];

    const lockResult = await client.query(
      `SELECT s.id, s.stock_name, s.stock_quantity, s.unit_cost, u.unit_name AS stock_unit_name
       FROM stock_db s
       INNER JOIN unit_db u ON u.id = s.unit_id
       WHERE s.deleted_at IS NULL
         AND s.user_id = $1
         AND s.id = ANY($2::uuid[])
       FOR UPDATE OF s`,
      [user_id, uniqueIds]
    );

    if (lockResult.rowCount !== uniqueIds.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Bazi stok kayitlari bulunamadi veya kullaniciya ait degil."
      });
    }

    const byStock = new Map(lockResult.rows.map((r) => [String(r.id), r]));

    for (const [sid, needQty] of needBySid.entries()) {
      const srow = byStock.get(String(sid));
      const current = Number(srow.stock_quantity);
      if (current + 1e-9 < needQty) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Yetersiz stok: ${srow.stock_name || sid} (mevcut ${current}, gerekli ${needQty}).`
        });
      }
    }

    for (const [sid, needQty] of needBySid.entries()) {
      await client.query(
        `UPDATE stock_db
         SET stock_quantity = stock_quantity - $1::numeric,
             updated_at = NOW()
         WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL`,
        [needQty, sid, user_id]
      );
    }

    await client.query(
      `UPDATE product_db SET updated_at = NOW() WHERE id = $1::uuid AND user_id = $2`,
      [productId, user_id]
    );

    await client.query(
      `INSERT INTO owned_product_db (user_id, product_id)
       VALUES ($1, $2::uuid)`,
      [user_id, productId]
    );

    await client.query("COMMIT");

    console.log("[product-service][produce] stok dusuldu:", { product_id: productId });
    return res.json({
      ok: true,
      message: "Uretim yapildi; malzemeler stoktan dustu.",
      product_id: productId
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_rb) {
      /* ignore */
    }
    console.error("[product-service][produce] hata:", error.message);
    return res.status(400).json({ message: "Uretim basarisiz.", detail: error.message });
  } finally {
    client.release();
  }
});

const start = async () => {
  await initProductDatabase(pool);
  app.listen(port, () => {
    console.log(`Product service running on ${port}`);
  });
};

start().catch((error) => {
  console.error("[product-service] Baslatilamadi:", error.message);
  process.exit(1);
});
