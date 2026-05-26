const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createPool, initProductDatabase } = require("../database/database");
const { getCache, setCache, delCache } = require("./cache");

const TTL_USER = 30;  // retails, owned-products
const TTL_PRODUCTS = 60; // product recipes

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

const listRetailsHandler = async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu." });
  }

  const cacheKey = `cache:retails:${user_id}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await pool.query(
      `SELECT
         r.id,
         r.user_id,
         r.retail_name,
         r.retail_quantity,
         r.retail_price,
         r.retail_seller_price,
         r.unit_id,
         r.customer_id,
         r.seller_id,
         u.unit_name,
         sl.seller_name,
         r.created_at,
         r.updated_at,
         r.deleted_at
       FROM retail_db r
       LEFT JOIN unit_db u ON u.id = r.unit_id AND u.deleted_at IS NULL
       LEFT JOIN seller_db sl ON sl.id = r.seller_id AND sl.deleted_at IS NULL
       WHERE r.user_id = $1
         AND r.deleted_at IS NULL
       ORDER BY r.created_at DESC`,
      [user_id]
    );
    await setCache(cacheKey, result.rows, TTL_USER);
    return res.json(result.rows);
  } catch (error) {
    console.error("[product-service][retails] liste hatasi:", error.message);
    return res.status(500).json({ message: "Perakende urunler listelenemedi." });
  }
};

const createRetailHandler = async (req, res) => {
  const {
    user_id,
    seller_id,
    retail_name,
    retail_quantity,
    unit_id,
    retail_seller_price,
    retail_price,
    paid_amount: paid_amount_raw
  } = req.body || {};

  if (
    !user_id ||
    !seller_id ||
    !retail_name ||
    retail_quantity === undefined ||
    !unit_id ||
    retail_seller_price === undefined ||
    retail_price === undefined
  ) {
    return res.status(400).json({
      message:
        "user_id, seller_id, retail_name, retail_quantity, unit_id, retail_seller_price ve retail_price zorunlu."
    });
  }

  const name = String(retail_name).trim();
  if (!name) {
    return res.status(400).json({ message: "Perakende urun adi bos olamaz." });
  }

  const parsedQty = Number(retail_quantity);
  const parsedBuy = Number(retail_seller_price);
  const parsedSell = Number(retail_price);
  if (Number.isNaN(parsedQty) || parsedQty <= 0) {
    return res.status(400).json({ message: "Miktar sifirdan buyuk olmali." });
  }
  if (Number.isNaN(parsedBuy) || parsedBuy < 0 || Number.isNaN(parsedSell) || parsedSell < 0) {
    return res.status(400).json({ message: "Alis ve satis fiyatlari gecerli olmali." });
  }

  try {
    const sellerCheck = await pool.query(
      `SELECT id FROM seller_db
       WHERE id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL`,
      [seller_id, user_id]
    );
    if (sellerCheck.rowCount === 0) {
      return res.status(400).json({ message: "Gecerli bir tedarikci seciniz." });
    }

    const unitCheck = await pool.query(
      `SELECT id FROM unit_db
       WHERE id = $1::uuid AND deleted_at IS NULL
         AND (is_default = TRUE OR user_id = $2::uuid)`,
      [unit_id, user_id]
    );
    if (unitCheck.rowCount === 0) {
      return res.status(400).json({ message: "Gecerli bir birim seciniz." });
    }

    const result = await pool.query(
      `INSERT INTO retail_db (
         user_id, retail_name, retail_quantity, retail_price, retail_seller_price,
         unit_id, seller_id
       )
       VALUES ($1::uuid, $2, $3::numeric, $4::numeric, $5::numeric, $6::uuid, $7::uuid)
       RETURNING id, user_id, retail_name, retail_quantity, retail_price, retail_seller_price,
                 unit_id, customer_id, seller_id, created_at, updated_at, deleted_at`,
      [
        user_id,
        name,
        roundMoney(parsedQty),
        roundMoney(parsedSell),
        roundMoney(parsedBuy),
        unit_id,
        seller_id
      ]
    );

    const row = result.rows[0];
    const enriched = await pool.query(
      `SELECT r.*, u.unit_name, sl.seller_name
       FROM retail_db r
       LEFT JOIN unit_db u ON u.id = r.unit_id
       LEFT JOIN seller_db sl ON sl.id = r.seller_id
       WHERE r.id = $1::uuid`,
      [row.id]
    );

    const purchaseTotal = roundMoney(parsedQty * parsedBuy);
    let paidExpense = purchaseTotal;
    if (paid_amount_raw !== undefined && paid_amount_raw !== null && paid_amount_raw !== "") {
      const p = parseMoneyInput(paid_amount_raw);
      if (p === null || Number.isNaN(p) || p < 0) {
        return res.status(400).json({ message: "Odenen tutar gecerli bir sayi olmalidir." });
      }
      if (p > purchaseTotal + 1e-6) {
        return res.status(400).json({ message: "Odenen tutar toplam alis tutarindan buyuk olamaz." });
      }
      paidExpense = p;
    }
    const remainingExpense = roundMoney(purchaseTotal - paidExpense);

    let paymentTxId = null;
    if (paidExpense > 1e-6) {
      try {
        const txRow = await postTransaction({
          user_id,
          amount: paidExpense,
          is_income: false,
          is_fixed: false,
          buyer_id: null,
          product_id: null,
          transaction_name: `${name} perakende alis`
        });
        paymentTxId = txRow?.id || null;
      } catch (txError) {
        console.error("[product-service][retails] alis gideri kaydi hatasi:", txError.message);
      }
    }
    if (remainingExpense > 1e-6) {
      try {
        await pool.query(
          `INSERT INTO liabilities_receivables_db (
            user_id, seller_id, customer_id, transaction_id, is_paid, amount, remaining_amount, is_receivable
          ) VALUES ($1::uuid, $2::uuid, NULL, $3::uuid, FALSE, $4::numeric, $5::numeric, FALSE)`,
          [user_id, seller_id, paymentTxId, purchaseTotal, remainingExpense]
        );
      } catch (liabError) {
        console.error("[product-service][retails] tedarikci borcu kaydi hatasi:", liabError.message);
      }
    }

    await delCache(`cache:retails:${user_id}`);
    return res.status(201).json(enriched.rows[0] || row);
  } catch (error) {
    console.error("[product-service][retails] kayit hatasi:", error.message);
    return res.status(400).json({ message: "Perakende urun kaydedilemedi.", detail: error.message });
  }
};

const sellRetailHandler = async (req, res) => {
  const retailId = req.params.retail_id;
  const {
    user_id,
    buyer_id,
    quantity_sold: qtyRaw,
    received_amount: received_raw,
    unit_sale_price: unit_sale_raw
  } = req.body || {};
  if (!user_id || !retailId || !buyer_id || qtyRaw === undefined || qtyRaw === null || qtyRaw === "") {
    return res.status(400).json({
      message: "user_id, retail_id, buyer_id ve quantity_sold zorunlu."
    });
  }

  const soldQty = Number(qtyRaw);
  if (Number.isNaN(soldQty) || soldQty <= 0) {
    return res.status(400).json({ message: "Satilan miktar sifirdan buyuk olmali." });
  }

  const client = await pool.connect();
  let retailName = "";
  let unitSell = 0;
  let unitBuy = 0;
  let saleTotal = 0;
  let soldProfit = 0;
  let remainingQty = 0;
  let collected = 0;
  let remainder = 0;
  try {
    await client.query("BEGIN");

    const retailResult = await client.query(
      `SELECT id, retail_name, retail_quantity, retail_price, retail_seller_price
       FROM retail_db
       WHERE id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL
       FOR UPDATE`,
      [retailId, user_id]
    );
    if (retailResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Perakende urun bulunamadi." });
    }
    const rrow = retailResult.rows[0];
    retailName = String(rrow.retail_name || "").trim();
    const available = Number(rrow.retail_quantity) || 0;
    unitSell = Number(rrow.retail_price) || 0;
    unitBuy = Number(rrow.retail_seller_price) || 0;

    if (unit_sale_raw !== undefined && unit_sale_raw !== null && unit_sale_raw !== "") {
      const overrideUnit = parseMoneyInput(unit_sale_raw);
      if (overrideUnit === null || Number.isNaN(overrideUnit) || overrideUnit < 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Birim satis fiyati gecerli bir sayi olmalidir." });
      }
      if (overrideUnit > 0) {
        unitSell = overrideUnit;
      }
    }

    if (soldQty > available + 1e-9) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Yetersiz stok. Mevcut miktar: ${available}.`
      });
    }
    if (unitSell <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Bu urun icin gecerli satis fiyati yok." });
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

    remainingQty = roundMoney(available - soldQty);
    await client.query(
      `UPDATE retail_db
       SET retail_quantity = $1::numeric,
           customer_id = $2::uuid,
           updated_at = NOW()
       WHERE id = $3::uuid`,
      [remainingQty, buyer_id, retailId]
    );

    saleTotal = roundMoney(soldQty * unitSell);
    soldProfit = roundMoney(soldQty * (unitSell - unitBuy));

    collected = saleTotal;
    if (received_raw !== undefined && received_raw !== null && received_raw !== "") {
      const r = parseMoneyInput(received_raw);
      if (r === null || Number.isNaN(r) || r < 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Tahsil ettiginiz tutar gecerli bir sayi olmalidir." });
      }
      if (r > saleTotal + 1e-6) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Tahsil ettiginiz tutar satis tutarindan buyuk olamaz." });
      }
      collected = r;
    }
    remainder = roundMoney(saleTotal - collected);

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_rb) {
      /* noop */
    }
    return res.status(400).json({ message: "Perakende satis basarisiz.", detail: error.message });
  } finally {
    client.release();
  }

  let incomeTxId = null;
  try {
    const txLabel = retailName
      ? `${retailName} perakende satis (${soldQty} adet)`
      : `Perakende satis (${soldQty} adet)`;
    const incomeRow = await postTransaction({
      user_id,
      amount: collected,
      is_income: true,
      is_fixed: false,
      buyer_id,
      product_id: null,
      transaction_name: txLabel
    });
    incomeTxId = incomeRow?.id || null;

    const recordedProfit =
      saleTotal > 1e-6 && soldProfit > 1e-6
        ? roundMoney(soldProfit * (collected / saleTotal))
        : 0;
    if (recordedProfit > 1e-6 && incomeTxId) {
      await pool.query(
        `INSERT INTO profit_db (user_id, transaction_id, product_id, customer_id, profit_amount)
         VALUES ($1::uuid, $2::uuid, NULL, $3::uuid, $4::numeric)`,
        [user_id, incomeTxId, buyer_id, recordedProfit]
      );
    }
  } catch (txError) {
    console.error("[product-service][retail-sell] transactions/profit_db kaydi hatasi:", txError.message);
  }

  if (remainder > 1e-6) {
    try {
      await pool.query(
        `INSERT INTO liabilities_receivables_db (
          user_id, seller_id, customer_id, transaction_id, is_paid, amount, remaining_amount, is_receivable
        ) VALUES ($1::uuid, NULL, $2::uuid, $3::uuid, FALSE, $4::numeric, $5::numeric, TRUE)`,
        [user_id, buyer_id, incomeTxId, saleTotal, remainder]
      );
    } catch (liabError) {
      console.error("[product-service][retail-sell] alacak kaydi hatasi:", liabError.message);
    }
  }

  await delCache(`cache:retails:${user_id}`);
  return res.json({
    ok: true,
    retail_id: retailId,
    quantity_sold: soldQty,
    sale_total: saleTotal,
    profit: soldProfit,
    buyer_id,
    collected_amount: collected,
    remainder_receivable: remainder,
    remaining_quantity: remainingQty
  });
};

app.get("/retails", listRetailsHandler);
app.get("/product/retails", listRetailsHandler);
app.post("/retails", createRetailHandler);
app.post("/product/retails", createRetailHandler);
app.post("/retails/:retail_id/sell", sellRetailHandler);
app.post("/product/retails/:retail_id/sell", sellRetailHandler);

const patchProductAlertHandler = async (req, res) => {
  const productId = req.params.id;
  const { user_id, product_alert: product_alert_raw } = req.body || {};
  if (!user_id || !productId) {
    return res.status(400).json({ message: "user_id ve product id zorunlu." });
  }
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, "product_alert")) {
    return res.status(400).json({ message: "product_alert alani zorunlu." });
  }

  let nextAlert = null;
  if (product_alert_raw !== null && product_alert_raw !== "") {
    const parsed = Number(product_alert_raw);
    if (Number.isNaN(parsed) || parsed < 0) {
      return res.status(400).json({ message: "product_alert gecerli bir sayi olmali (0 veya buyuk)." });
    }
    nextAlert = parsed;
  }

  try {
    const result = await pool.query(
      `UPDATE product_db
       SET product_alert = $1::numeric,
           updated_at = NOW()
       WHERE id = $2::uuid AND user_id = $3::uuid AND deleted_at IS NULL
       RETURNING id, user_id, product_name, product_alert, updated_at`,
      [nextAlert, productId, user_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Urun bulunamadi." });
    }
    await delCache(`cache:owned-products:${user_id}`);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("[product-service][product-alert] guncelleme hatasi:", error.message);
    return res.status(400).json({ message: "Urun uyarisi guncellenemedi.", detail: error.message });
  }
};

app.patch("/products/:id/alert", patchProductAlertHandler);
app.patch("/product/products/:id/alert", patchProductAlertHandler);

const listOwnedProductsHandler = async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu." });
  }

  const cacheKey = `cache:owned-products:${user_id}`;
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);

  try {
    const result = await pool.query(
      `SELECT
         p.id AS product_id,
         p.product_name,
         p.price,
         p.product_alert,
         COUNT(o.id)::integer AS adet,
         MAX(o.created_at) AS last_produced_at
       FROM owned_product_db o
       INNER JOIN product_db p
         ON p.id = o.product_id
        AND p.user_id = o.user_id
        AND p.deleted_at IS NULL
       WHERE o.user_id = $1
         AND o.deleted_at IS NULL
       GROUP BY p.id, p.product_name, p.price, p.product_alert
       ORDER BY MAX(o.created_at) DESC`,
      [user_id]
    );
    const rows = result.rows.map((row) => {
      const alertRaw = row.product_alert;
      const alertNum = alertRaw === null || alertRaw === undefined ? null : Number(alertRaw);
      return {
        ...row,
        adet: Number(row.adet) || 0,
        product_alert:
          alertNum === null || Number.isNaN(alertNum) ? null : Math.round(alertNum * 1000) / 1000
      };
    });
    await setCache(cacheKey, rows, TTL_USER);
    return res.json(rows);
  } catch (error) {
    console.error("[product-service][owned-products] liste hatasi:", error.message);
    return res.status(500).json({ message: "Uretilen urunler listelenemedi." });
  }
};

app.get("/owned-products", listOwnedProductsHandler);
app.get("/product/owned-products", listOwnedProductsHandler);

app.post("/owned-products/:product_id/sell", async (req, res) => {
  const productId = req.params.product_id;
  const { user_id, buyer_id, received_amount: received_raw, sale_price: sale_price_raw } = req.body || {};
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
    if (sale_price_raw !== undefined && sale_price_raw !== null && sale_price_raw !== "") {
      const overridePrice = parseMoneyInput(sale_price_raw);
      if (overridePrice === null || Number.isNaN(overridePrice) || overridePrice < 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Satis fiyati gecerli bir sayi olmalidir." });
      }
      if (overridePrice > 0) {
        soldPrice = overridePrice;
      }
    }
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

  await delCache(`cache:owned-products:${user_id}`);
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

  const cacheKey = `cache:products:${user_id}`;
  const cachedResult = await getCache(cacheKey);
  if (cachedResult) return res.json(cachedResult);

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
      const inMem = recipeCacheByProductId.get(pid);
      return { ...row, materials: Array.isArray(inMem) ? inMem : [] };
    });
    await setCache(cacheKey, out, TTL_PRODUCTS);
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
    await delCache(`cache:products:${user_id}`);

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
    await delCache(`cache:products:${user_id}`);
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
    await delCache(`cache:products:${user_id}`, `cache:owned-products:${user_id}`);
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
    await delCache(`cache:owned-products:${user_id}`, `cache:stocks:${user_id}`);
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
