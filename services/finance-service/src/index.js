const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createPool, initFinanceDatabase } = require("../database/database");

const app = express();
const port = process.env.PORT || 4003;
const pool = createPool();
const transactionsServiceBase = (process.env.TRANSACTIONS_SERVICE_URL || "http://localhost:4006").replace(/\/$/, "");
const BUSINESS_TZ = process.env.APP_TIMEZONE || "Europe/Istanbul";
const DAILY_FIXED_EXPENSE_TX_PREFIX = "Gunluk sabit gider:";

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

const recordTransaction = async ({
  user_id,
  amount,
  is_income,
  is_fixed = false,
  transaction_name = null,
  buyer_id = null,
  transaction_time = null
}) => {
  const body = {
    user_id,
    amount,
    is_income,
    is_fixed,
    transaction_name,
    buyer_id: buyer_id || null,
    ...(transaction_time ? { transaction_time: transaction_time } : {})
  };
  const response = await fetch(`${transactionsServiceBase}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`transactions-service ${response.status}: ${txt}`);
  }
};

/** Istanbul takvimine göre cari ayın ilk günü (YYYY-MM-DD). */
const currentMonthStartIstanbul = async () => {
  const res = await pool.query(
    `SELECT (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE $1)::timestamp)::date)::text AS d`,
    [BUSINESS_TZ]
  );
  return res.rows[0]?.d || null;
};

/**
 * Sabit kalem için ilgili ayda borç/alacak satırı: gider → borç, gelir → alacak.
 * Aynı fixed_id + ay için zaten satır varsa eklemez.
 */
const createFixedLiabilityRow = async ({ user_id, fixed_id, billing_month }) => {
  await pool.query(
    `INSERT INTO liabilities_receivables_db (
       user_id, seller_id, customer_id, transaction_id, is_paid,
       amount, remaining_amount, is_receivable, fixed_id, billing_month
     )
     SELECT f.user_id, NULL, NULL, NULL, FALSE,
            f.amount::numeric, f.amount::numeric, f.is_fixed_income,
            f.id, $3::date
     FROM fixed_db f
     WHERE f.id = $1::uuid
       AND f.user_id = $2::uuid
       AND f.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM liabilities_receivables_db lr
         WHERE lr.fixed_id = f.id
           AND lr.billing_month = $3::date
           AND lr.deleted_at IS NULL
       )`,
    [fixed_id, user_id, billing_month]
  );
};

/** Tüm aktif sabit kalemler için cari ay borç/alacak satırı yoksa oluşturur. */
const runMonthlyFixedTransactions = async () => {
  const monthStart = await currentMonthStartIstanbul();
  if (!monthStart) return;
  try {
    const result = await pool.query(
      `INSERT INTO liabilities_receivables_db (
         user_id, seller_id, customer_id, transaction_id, is_paid,
         amount, remaining_amount, is_receivable, fixed_id, billing_month
       )
       SELECT f.user_id, NULL, NULL, NULL, FALSE,
              f.amount::numeric, f.amount::numeric, f.is_fixed_income,
              f.id, $1::date
       FROM fixed_db f
       WHERE f.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM liabilities_receivables_db lr
           WHERE lr.fixed_id = f.id
             AND lr.billing_month = $1::date
             AND lr.deleted_at IS NULL
         )`,
      [monthStart]
    );
    if (result.rowCount > 0) {
      console.log(
        `[finance-service] Sabit kalemler icin ${result.rowCount} borc/alacak satiri (${monthStart}).`
      );
    }
  } catch (error) {
    console.error("[finance-service] Aylik sabit borc/alacak hatasi:", error.message);
  }
};

/** Aylık sabit gider tutarının günlük payı (transactions_db ye bu miktar yazılır). */
const dailyPortionFromMonthly = (monthly) => {
  const n = Number(monthly);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = Math.round((n / 30) * 10000) / 10000;
  return d > 0 ? d : null;
};

const ROLLING_FIXED_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Bugün Istanbul takvim tarihi YYYY-MM-DD */
const todayIstanbulYmd = async () => {
  const res = await pool.query(
    `SELECT to_char((CURRENT_TIMESTAMP AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d`,
    [BUSINESS_TZ]
  );
  return res.rows[0]?.d || null;
};

/** Müşteri satırına yazılan tutar = aylık sabit gider ÷ 30 (müşteri sayısına bölünmez). */
const expenseShareRounded = (monthlyAmount) => {
  const monthly = Number(monthlyAmount);
  if (!Number.isFinite(monthly) || monthly <= 0) return null;
  const dailyTotal = monthly / 30;
  const rounded = Math.round(dailyTotal * 10000) / 10000;
  return rounded > 0 ? rounded : null;
};

const lastRollingFixedExpenseTime = async (userId, buyerId, txName) => {
  const res = await pool.query(
    `SELECT transaction_time
     FROM transactions_db
     WHERE user_id = $1::uuid
       AND buyer_id = $2::uuid
       AND deleted_at IS NULL
       AND is_income = FALSE
       AND is_fixed = TRUE
       AND transaction_name = $3
     ORDER BY transaction_time DESC
     LIMIT 1`,
    [userId, buyerId, txName]
  );
  const t = res.rows[0]?.transaction_time;
  return t ? new Date(t).getTime() : null;
};

const postExpenseShareIfReady = async ({
  userId,
  buyerId,
  expense,
  transactionTimeIso,
  minMsSinceLast
}) => {
  const monthly = expense.amount;
  const rounded = expenseShareRounded(monthly);
  if (rounded == null) return false;

  const txName = `${DAILY_FIXED_EXPENSE_TX_PREFIX} ${String(expense.fixed_name || "").trim()}`;
  const lastMs = await lastRollingFixedExpenseTime(userId, buyerId, txName);
  const now = Date.now();
  if (lastMs != null) {
    if (now - lastMs < minMsSinceLast) return false;
  }

  await recordTransaction({
    user_id: userId,
    amount: rounded,
    is_income: false,
    is_fixed: true,
    transaction_name: txName,
    buyer_id: buyerId,
    transaction_time: transactionTimeIso
  });
  return true;
};

/**
 * Aktif müşteriler için sabit gider: aylık ÷ 30; son kayıttan en az 24 saat geçmişse yeniden yazılır.
 */
const runRollingCustomerFixedExpenseShares = async () => {
  /* no-op: sabit gelir/gider artik otomatik transactions kaydi uretmiyor */
};

/**
 * Yeni müşteri: günlük sabit gider payını hemen yaz (aynı talebin tekrarında çift kayıt önlenir).
 */
const bootstrapCustomerFixedExpenseShares = async () => ({ applied: 0 });

app.get("/health", (_req, res) => {
  res.json({ service: "finance-service", ok: true });
});

app.get("/transactions", async (_req, res) => {
  const result = await pool.query("SELECT * FROM finance_transactions ORDER BY id DESC");
  res.json(result.rows);
});

app.post("/transactions", async (req, res) => {
  const { type, amount, description = "" } = req.body;
  if (!["income", "expense"].includes(type)) {
    return res.status(400).json({ message: "type income veya expense olmali" });
  }

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ message: "amount sifirdan buyuk olmali" });
  }

  const result = await pool.query(
    "INSERT INTO finance_transactions(type, amount, description) VALUES($1, $2, $3) RETURNING *",
    [type, amount, description]
  );

  return res.status(201).json(result.rows[0]);
});

app.get("/summary", async (_req, res) => {
  const incomeResult = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM finance_transactions WHERE type = 'income'"
  );
  const expenseResult = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM finance_transactions WHERE type = 'expense'"
  );

  const income = Number(incomeResult.rows[0].total);
  const expense = Number(expenseResult.rows[0].total);

  res.json({ income, expense, balance: income - expense });
});

app.get("/fixed", async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ message: "user_id zorunlu" });
  }
  try {
    const result = await pool.query(
      `SELECT id, user_id, fixed_name, is_fixed_income, amount, is_default, created_at, updated_at, deleted_at
       FROM fixed_db
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [user_id]
    );
    return res.json(result.rows);
  } catch (error) {
    console.error("[finance-service][fixed] listeleme hatasi:", error.message);
    return res.status(500).json({ message: "Sabit gelir/gider listelenemedi." });
  }
});

app.post("/fixed", async (req, res) => {
  const { user_id, fixed_name, is_fixed_income, amount, is_default: bodyIsDefault } = req.body || {};
  if (!user_id || !fixed_name?.trim() || typeof is_fixed_income !== "boolean" || amount === undefined) {
    return res
      .status(400)
      .json({ message: "user_id, fixed_name, is_fixed_income ve amount zorunlu." });
  }

  const parsedAmount = Number(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ message: "amount sifirdan buyuk sayi olmali." });
  }

  const rowIsDefault =
    bodyIsDefault === true || bodyIsDefault === "true" || bodyIsDefault === 1;

  try {
    const result = await pool.query(
      `INSERT INTO fixed_db (user_id, fixed_name, is_fixed_income, amount, is_default)
       VALUES ($1, $2, $3, $4::numeric, $5)
       RETURNING id, user_id, fixed_name, is_fixed_income, amount, is_default, created_at, updated_at, deleted_at`,
      [user_id, fixed_name.trim(), is_fixed_income, parsedAmount, rowIsDefault]
    );
    try {
      const billingMonth = await currentMonthStartIstanbul();
      if (billingMonth) {
        await createFixedLiabilityRow({
          user_id,
          fixed_id: result.rows[0].id,
          billing_month: billingMonth
        });
      }
    } catch (lrError) {
      console.error("[finance-service][fixed] liabilities kaydi hatasi:", lrError.message);
    }
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("[finance-service][fixed] ekleme hatasi:", error.message);
    return res.status(400).json({ message: "Sabit gelir/gider kaydedilemedi.", detail: error.message });
  }
});

app.patch("/fixed/:id", async (req, res) => {
  const fixedId = req.params.id;
  const { user_id, fixed_name, amount, is_default: patchIsDefault } = req.body || {};
  if (!user_id || !fixedId || !fixed_name?.trim() || amount === undefined) {
    return res.status(400).json({ message: "user_id, id, fixed_name ve amount zorunlu." });
  }
  const parsedAmount = Number(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ message: "amount sifirdan buyuk sayi olmali." });
  }
  const patchDefault =
    typeof patchIsDefault === "boolean"
      ? patchIsDefault
      : patchIsDefault === true || patchIsDefault === "true"
        ? true
        : patchIsDefault === false || patchIsDefault === "false"
          ? false
          : null;
  try {
    const params = [fixed_name.trim(), parsedAmount];
    let sets = ["fixed_name = $1", "amount = $2::numeric", "updated_at = NOW()"];
    let nextIdx = 3;
    if (patchDefault !== null) {
      sets.push(`is_default = $${nextIdx}`);
      params.push(patchDefault);
      nextIdx++;
    }
    params.push(fixedId, user_id);
    const result = await pool.query(
      `UPDATE fixed_db
       SET ${sets.join(", ")}
       WHERE id = $${nextIdx}::uuid
         AND user_id = $${nextIdx + 1}
         AND deleted_at IS NULL
       RETURNING id, user_id, fixed_name, is_fixed_income, amount, is_default, created_at, updated_at, deleted_at`,
      params
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Kayit bulunamadi." });
    }
    return res.json(result.rows[0]);
  } catch (error) {
    console.error("[finance-service][fixed] guncelleme hatasi:", error.message);
    return res.status(400).json({ message: "Sabit kayit guncellenemedi.", detail: error.message });
  }
});

app.delete("/fixed/:id", async (req, res) => {
  const fixedId = req.params.id;
  const { user_id } = req.body || {};
  if (!user_id || !fixedId) {
    return res.status(400).json({ message: "user_id ve id zorunlu." });
  }
  try {
    const result = await pool.query(
      `UPDATE fixed_db
       SET deleted_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid
         AND user_id = $2
         AND deleted_at IS NULL
       RETURNING id`,
      [fixedId, user_id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Kayit bulunamadi." });
    }
    return res.json({ ok: true, message: "Sabit kayit silindi." });
  } catch (error) {
    console.error("[finance-service][fixed] silme hatasi:", error.message);
    return res.status(400).json({ message: "Sabit kayit silinemedi.", detail: error.message });
  }
});

/** Müşteri oluşturulunca customer-service tarafından çağrılır; sabit gider günlük payı hemen işlenir. */
app.post("/customer-fixed-expense-shares/bootstrap", async (req, res) => {
  const { user_id, customer_id } = req.body || {};
  if (!user_id || !customer_id) {
    return res.status(400).json({ message: "user_id ve customer_id zorunlu." });
  }
  try {
    const result = await bootstrapCustomerFixedExpenseShares(user_id, customer_id);
    return res.json({ ok: true, applied: result.applied });
  } catch (error) {
    console.error("[finance-service][fixed] bootstrap musteri sabit gider hatasi:", error.message);
    return res.status(400).json({ message: error.message || "Sabit gider payi uygulanamadi." });
  }
});

const start = async () => {
  await initFinanceDatabase(pool);
  await runMonthlyFixedTransactions();
  await runRollingCustomerFixedExpenseShares();
  setInterval(() => {
    runMonthlyFixedTransactions();
    runRollingCustomerFixedExpenseShares();
  }, 60 * 60 * 1000);
  app.listen(port, () => {
    console.log(`Finance service running on ${port}`);
  });
};

start().catch((error) => {
  console.error("[finance-service] Baslatilamadi:", error.message);
  process.exit(1);
});
