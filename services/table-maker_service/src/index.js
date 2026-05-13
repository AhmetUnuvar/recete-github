const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const puppeteer = require("puppeteer-core");

const app = express();
const port = process.env.PORT || 4008;

app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const escapeCsvCell = (value) => {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

const parseSignedAmount = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const sign = text.startsWith("-") ? -1 : 1;
  const normalized = text
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/^\+/, "");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;
  return sign * Math.abs(parsed);
};

const formatAmountTr = (value) =>
  Number(value || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

const buildCsv = ({ columns, rows, extras = [] }) => {
  const header = columns.map((c) => escapeCsvCell(c.label || c.key)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(row?.[c.key] ?? "")).join(",")
  );

  const parts = [header, ...lines];
  const hasAmountColumn = columns.some((c) => c.key === "amount");
  if (hasAmountColumn) {
    const amountTotal = rows.reduce((sum, row) => {
      const parsed = parseSignedAmount(row?.amount);
      return parsed == null ? sum : sum + parsed;
    }, 0);

    const summaryLine = columns.map((c, index) => {
      if (index === 0) return escapeCsvCell("Toplam kazanılan para");
      if (c.key === "amount") return escapeCsvCell(formatAmountTr(amountTotal));
      return "";
    });

    parts.push("", summaryLine.join(","));
  }

  if (Array.isArray(extras) && extras.length > 0) {
    parts.push("");
    for (const ex of extras) {
      parts.push(`${escapeCsvCell(ex.label)},${escapeCsvCell(ex.value)}`);
    }
  }

  return parts.join("\n");
};

const buildHtml = ({ title, columns, rows, extras = [] }) => {
  const tableHead = columns
    .map((c) => `<th>${escapeHtml(c.label || c.key)}</th>`)
    .join("");
  const tableRows = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td>${escapeHtml(row?.[c.key] ?? "")}</td>`)
          .join("")}</tr>`
    )
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
        h1 { margin: 0 0 14px 0; font-size: 20px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th, td { border: 1px solid #d9d9d9; padding: 8px; font-size: 12px; word-wrap: break-word; }
        th { background: #f2f2f2; text-align: left; }
        .extras { margin-top: 16px; font-size: 13px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(title || "Tablo")}</h1>
      <table>
        <thead><tr>${tableHead}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
      ${
        Array.isArray(extras) && extras.length > 0
          ? `<div class="extras">${extras
              .map(
                (ex) =>
                  `<p><strong>${escapeHtml(ex.label)}</strong>: ${escapeHtml(ex.value)}</p>`
              )
              .join("")}</div>`
          : ""
      }
    </body>
  </html>`;
};

const buildPng = async ({ title, columns, rows, extras = [] }) => {
  const html = buildHtml({ title, columns, rows, extras });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    const body = await page.$("body");
    const buffer = await body.screenshot({ type: "png" });
    return buffer.toString("base64");
  } finally {
    await browser.close();
  }
};

app.get("/health", (_req, res) => {
  res.json({ service: "table-maker-service", ok: true });
});

app.post("/table/export", async (req, res) => {
  const body = req.body || {};
  const { format = "csv", title = "Tablo", columns = [], rows = [] } = body;
  const extras = Array.isArray(body.extras) ? body.extras : [];
  if (!["csv", "png"].includes(format)) {
    return res.status(400).json({ message: "format csv veya png olmali." });
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    return res.status(400).json({ message: "columns bos olamaz." });
  }
  if (!Array.isArray(rows)) {
    return res.status(400).json({ message: "rows dizi olmali." });
  }

  try {
    if (format === "csv") {
      const csv = buildCsv({ columns, rows, extras });
      return res.json({
        file_name: "musteri-islemleri.csv",
        mime_type: "text/csv",
        base64: Buffer.from(`\uFEFF${csv}`, "utf8").toString("base64")
      });
    }

    const base64 = await buildPng({ title, columns, rows, extras });
    return res.json({
      file_name: "musteri-islemleri.png",
      mime_type: "image/png",
      base64
    });
  } catch (error) {
    console.error("[table-maker-service] export hatasi:", error.message);
    return res.status(500).json({ message: "Tablo olusturulamadi.", detail: error.message });
  }
});

app.listen(port, () => {
  console.log(`Table maker service running on ${port}`);
});
