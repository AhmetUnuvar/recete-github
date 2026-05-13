const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createPool, initReceivablesPayablesDatabase } = require("../database/database");

const app = express();
const port = process.env.PORT || 4010;
const pool = createPool();
const transactionsServiceBase = (process.env.TRANSACTIONS_SERVICE_URL || "http://localhost:4006").replace(/\/$/, "");

const roundMoney = (n) => Math.round(Number(n) * 10000) / 10000;

const parseMoneyInput = (raw) => {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  const num = Number(s);
  if (Number.isNaN(num)) return Number.NaN;
  return Math.round(num * 10000) / 10000;
};

const postTransaction = async ({ user_id, amount, is_income, buyer_id = null, transaction_name = null }) => {
  const parsedAmount = Number(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    throw new Error("transaction amount gecersiz");
  }
  const response = await fetch(`${transactionsServiceBase}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id,
      amount: parsedAmount,
      is_income,
      buyer_id,
      transaction_name: transaction_name ? String(transaction_name).trim().slice(0, 200) : null
    })
  });
  const txt = await response.text();
  if (!response.ok) {
    throw new Error(txt || String(response.status));
  }
};

const revertBalanceRow = async ({ balanceId, userId, prevRemaining, wasFullySettled }) => {
  if (wasFullySettled) {
    await pool.query(
      `UPDATE liabilities_receivables_db
       SET remaining_amount = $3::numeric, is_paid = FALSE, deleted_at = NULL, updated_at = NOW()
       WHERE id = $1::uuid AND user_id = $2::uuid`,
      [balanceId, userId, prevRemaining]
    );
  } else {
    await pool.query(
      `UPDATE liabilities_receivables_db
       SET remaining_amount = $3::numeric, updated_at = NOW()
       WHERE id = $1::uuid AND user_id = $2::uuid`,
      [balanceId, userId, prevRemaining]
    );
  }
};

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "receivables-payables-service", ok: true });
});

app.get("/balances", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu." });
  }
  try {
    const result = await pool.query(
      `SELECT
         lr.id,
         lr.user_id,
         lr.seller_id,
         lr.customer_id,
         lr.transaction_id,
         lr.fixed_id,
         lr.billing_month::text AS billing_month,
         lr.is_paid,
         lr.amount,
         lr.remaining_amount,
         lr.is_receivable,
         lr.payment_date::text AS payment_date,
         lr.created_at,
         lr.updated_at,
         sd.seller_name,
         cust.customer_name AS customer_name,
         fd.fixed_name AS fixed_name
       FROM liabilities_receivables_db lr
       LEFT JOIN seller_db sd
         ON sd.id = lr.seller_id
        AND sd.deleted_at IS NULL
       LEFT JOIN customers_db cust
         ON cust.id = lr.customer_id
        AND cust.deleted_at IS NULL
       LEFT JOIN fixed_db fd
         ON fd.id = lr.fixed_id
        AND fd.user_id = lr.user_id
        AND fd.deleted_at IS NULL
       WHERE lr.user_id = $1::uuid
         AND lr.deleted_at IS NULL
       ORDER BY lr.created_at DESC`,
      [user_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("[receivables-payables-service][balances] liste hatasi:", error.message);
    return res.status(500).json({ message: "Kayitlar listelenemedi.", detail: error.message });
  }
});

app.patch("/balances/:id", async (req, res) => {
  const balanceId = req.params.id;
  const body = req.body || {};
  const { user_id } = body;
  if (!user_id || !balanceId) {
    return res.status(400).json({ message: "user_id ve bakiye satiri kimligi zorunlu." });
  }

  const hasRem = Object.prototype.hasOwnProperty.call(body, "remaining_amount");
  const hasDate = Object.prototype.hasOwnProperty.call(body, "payment_date");
  if (!hasRem && !hasDate) {
    return res
      .status(400)
      .json({ message: "remaining_amount ve/veya payment_date alanlarindan en az birini gondermelisiniz." });
  }

  let newRemaining;
  if (hasRem) {
    newRemaining = parseMoneyInput(body.remaining_amount);
    if (newRemaining === null || Number.isNaN(newRemaining) || newRemaining < 0) {
      return res.status(400).json({ message: "remaining_amount gecerli bir sayi olmalidir (0 veya buyuk)." });
    }
  }

  let pgDateLiteral = undefined;
  if (hasDate) {
    if (body.payment_date === null || body.payment_date === "") {
      pgDateLiteral = null;
    } else {
      const s = String(body.payment_date).trim().split("T")[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return res.status(400).json({ message: "payment_date YYYY-MM-DD formatinda olmalidir." });
      }
      const [y, m, d] = s.split("-").map(Number);
      const check = new Date(y, m - 1, d);
      if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) {
        return res.status(400).json({ message: "payment_date gecerli bir takvim tarihi olmalidir." });
      }
      pgDateLiteral = s;
    }
  }

  try {
    const sel = await pool.query(
      `SELECT amount::numeric AS amount
       FROM liabilities_receivables_db
       WHERE id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL
       LIMIT 1`,
      [balanceId, user_id]
    );
    if (sel.rowCount === 0) {
      return res.status(404).json({ message: "Kayit bulunamadi." });
    }
    const maxAmount = roundMoney(sel.rows[0].amount);
    if (hasRem && newRemaining > maxAmount + 1e-6) {
      return res.status(400).json({ message: "Kalan tutar, toplam tutardan buyuk olamaz." });
    }

    const params = [balanceId, user_id];
    const setParts = [];

    if (hasRem) {
      params.push(newRemaining);
      setParts.push(`remaining_amount = $${params.length}::numeric`);
    }
    if (hasDate) {
      params.push(pgDateLiteral);
      setParts.push(`payment_date = $${params.length}::date`);
    }
    setParts.push("updated_at = NOW()");

    const sql = `
      UPDATE liabilities_receivables_db
      SET ${setParts.join(", ")}
      WHERE id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL
      RETURNING id, remaining_amount, amount::numeric AS amount, payment_date::text AS payment_date
    `;
    const result = await pool.query(sql, params);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Kayit bulunamadi." });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("[receivables-payables-service][balances patch] hata:", error.message);
    return res.status(400).json({ message: "Kayit guncellenemedi.", detail: error.message });
  }
});

app.patch("/balances/:id/payment-date", async (req, res) => {
  const balanceId = req.params.id;
  const { user_id, payment_date } = req.body || {};
  if (!user_id || !balanceId) {
    return res.status(400).json({ message: "user_id ve bakiye satiri kimligi zorunlu." });
  }
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, "payment_date")) {
    return res.status(400).json({ message: "payment_date alani zorunlu (null veya \"\" ile tarihi silebilirsiniz)." });
  }

  let pgDateLiteral = null;
  if (payment_date !== null && payment_date !== "") {
    const s = String(payment_date).trim().split("T")[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return res.status(400).json({ message: "payment_date YYYY-MM-DD formatinda olmalidir." });
    }
    const [y, m, d] = s.split("-").map(Number);
    const check = new Date(y, m - 1, d);
    if (check.getFullYear() !== y || check.getMonth() !== m - 1 || check.getDate() !== d) {
      return res.status(400).json({ message: "payment_date gecerli bir takvim tarihi olmalidir." });
    }
    pgDateLiteral = s;
  }

  try {
    const result = await pool.query(
      `UPDATE liabilities_receivables_db
       SET payment_date = $3::date, updated_at = NOW()
       WHERE id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL
       RETURNING id, payment_date::text AS payment_date`,
      [balanceId, user_id, pgDateLiteral]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Kayit bulunamadi." });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("[receivables-payables-service][payment-date] hata:", error.message);
    return res.status(400).json({ message: "Tarih guncellenemedi.", detail: error.message });
  }
});

app.post("/balances/:id/settle", async (req, res) => {
  const balanceId = req.params.id;
  const { user_id, amount: amountRaw } = req.body || {};
  if (!user_id || !balanceId) {
    return res.status(400).json({ message: "user_id ve bakiye satiri kimligi zorunlu." });
  }
  const pay = parseMoneyInput(amountRaw);
  if (pay === null || Number.isNaN(pay) || pay <= 0) {
    return res.status(400).json({ message: "Tutar sifirdan buyuk gecerli bir sayi olmalidir." });
  }

  const client = await pool.connect();
  let prevRemaining = 0;
  let newRemainingAfter = 0;
  let wasFullySettled = false;
  let rowIsReceivable = false;
  let rowCustomerId = null;
  let rowSellerHint = "";

  try {
    await client.query("BEGIN");

    /* JOIN + FOR UPDATE: yalnizca lr kilitleyin; aksi halde Postgres "nullable side of outer join" hatasi verebilir. */
    const sel = await client.query(
      `SELECT
         lr.id,
         lr.user_id,
         lr.remaining_amount,
         lr.is_receivable,
         lr.customer_id,
         lr.seller_id
       FROM liabilities_receivables_db lr
       WHERE lr.id = $1::uuid AND lr.user_id = $2::uuid AND lr.deleted_at IS NULL
       FOR UPDATE OF lr`,
      [balanceId, user_id]
    );

    if (sel.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Kayit bulunamadi veya kapatilmis." });
    }

    const row = sel.rows[0];
    prevRemaining = roundMoney(row.remaining_amount);
    rowIsReceivable = row.is_receivable === true;
    rowCustomerId = row.customer_id || null;

    if (row.seller_id) {
      const sn = await client.query(
        `SELECT seller_name FROM seller_db
         WHERE id = $1::uuid AND deleted_at IS NULL
         LIMIT 1`,
        [row.seller_id]
      );
      rowSellerHint =
        sn.rows[0]?.seller_name ? String(sn.rows[0].seller_name).trim().slice(0, 80) : "";
    } else {
      rowSellerHint = "";
    }

    if (pay > prevRemaining + 1e-6) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Tutar kalan tutardan buyuk olamaz." });
    }

    newRemainingAfter = roundMoney(prevRemaining - pay);
    wasFullySettled = newRemainingAfter <= 1e-6;

    if (wasFullySettled) {
      await client.query(
        `UPDATE liabilities_receivables_db
         SET remaining_amount = 0, is_paid = TRUE, deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1::uuid AND user_id = $2::uuid`,
        [balanceId, user_id]
      );
    } else {
      await client.query(
        `UPDATE liabilities_receivables_db
         SET remaining_amount = $1::numeric, updated_at = NOW(), is_paid = FALSE
         WHERE id = $2::uuid AND user_id = $3::uuid`,
        [newRemainingAfter, balanceId, user_id]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_e) {
      /* noop */
    }
    console.error("[receivables-payables-service][settle] db hatasi:", error.message);
    return res.status(500).json({ message: "Bakiye guncellenemedi.", detail: error.message });
  } finally {
    client.release();
  }

  const txnName =
    rowIsReceivable === true ? "Alacak tahsilati" : rowSellerHint ? `Borc odemesi (${rowSellerHint})` : "Borc odemesi";

  try {
    await postTransaction({
      user_id,
      amount: pay,
      is_income: rowIsReceivable === true,
      buyer_id: rowIsReceivable === true ? rowCustomerId : null,
      transaction_name: txnName
    });
  } catch (txError) {
    console.error("[receivables-payables-service][settle] transactions hatasi, geri aliniyor:", txError.message);
    try {
      await revertBalanceRow({
        balanceId,
        userId: user_id,
        prevRemaining,
        wasFullySettled
      });
    } catch (revErr) {
      console.error("[receivables-payables-service][settle] geri alma hatasi:", revErr.message);
    }
    return res.status(502).json({
      message: "Islem kaydedilemedi; bakiye onceki haline dondu. Tekrar deneyin.",
      detail: txError.message
    });
  }

  return res.json({
    ok: true,
    settled_amount: pay,
    remaining_amount: wasFullySettled ? 0 : newRemainingAfter,
    closed: wasFullySettled
  });
});

const start = async () => {
  await initReceivablesPayablesDatabase(pool);
  app.listen(port, () => {
    console.log(`[receivables-payables-service] HTTP ${port} portunda calisiyor.`);
  });
};

start().catch((error) => {
  console.error("[receivables-payables-service] Baslatilamadi:", error.message);
  process.exit(1);
});
