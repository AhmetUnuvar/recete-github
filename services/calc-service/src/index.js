const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { computeRecipeCost } = require("./recipeCost");
const { createPool, initCalcDatabase } = require("../database/database");

const app = express();
const port = process.env.PORT || 4005;

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ service: "calc-service", ok: true });
});

app.post("/recipe-cost", (req, res) => {
  const { lines } = req.body;
  const result = computeRecipeCost(lines);
  if (!result.ok) {
    return res.status(400).json({
      message: result.error || "maliyet hesaplanamadi",
      line_index: result.line_index
    });
  }
  return res.json(result);
});

const start = async () => {
  if (process.env.DATABASE_URL) {
    const pool = createPool();
    await initCalcDatabase(pool);
  } else {
    console.warn("[calc-service] DATABASE_URL tanimli degil; profit_db baslatilmadi.");
  }

  app.listen(port, () => {
    console.log(`Calc service running on ${port}`);
  });
};

start().catch((err) => {
  console.error("[calc-service] Baslatma hatasi:", err);
  process.exit(1);
});
