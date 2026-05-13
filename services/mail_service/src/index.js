const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { createPool, initMailDatabase } = require("../database/database");

const app = express();
const port = process.env.PORT || 4011;
const pool = createPool();

const registerJwtSecret =
  process.env.REGISTER_EMAIL_JWT_SECRET || "dev-register-email-jwt-change-me";
const codeTtlMinutes = Number(process.env.REGISTRATION_CODE_TTL_MINUTES || 15);
const passwordResetCodeTtlMinutes = Number(
  process.env.PASSWORD_RESET_CODE_TTL_MINUTES || process.env.REGISTRATION_CODE_TTL_MINUTES || 15
);
const proofTtl = process.env.REGISTRATION_PROOF_TTL || "30m";
const passwordResetProofTtl = process.env.PASSWORD_RESET_PROOF_TTL || "30m";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isValidEmailShape = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const createSmtpTransport = () => {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const portNum = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || portNum === 465;
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  return nodemailer.createTransport({
    host,
    port: portNum,
    secure,
    auth: user ? { user, pass } : undefined
  });
};

const generateSixDigitCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const sendRegistrationEmail = async ({ to, code }) => {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@localhost";
  const transport = createSmtpTransport();
  const subject = process.env.MAIL_REGISTRATION_SUBJECT || "Recete kayit dogrulama kodu";
  const text = `Kayit dogrulama kodunuz: ${code}\n\nBu kod ${codeTtlMinutes} dakika gecerlidir.`;
  const html = `<p>Kayit dogrulama kodunuz:</p><p style="font-size:22px;font-weight:bold;letter-spacing:4px">${code}</p><p>Bu kod <strong>${codeTtlMinutes} dakika</strong> gecerlidir.</p>`;

  if (!transport) {
    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
    if (isProd) {
      const err = new Error("SMTP yapilandirilmamis");
      err.statusCode = 503;
      throw err;
    }
    console.warn(
      `[mail-service] SMTP_HOST yok; gelistirme modunda kod konsola yazildi: ${to} -> ${code}`
    );
    return;
  }

  await transport.sendMail({
    from,
    to,
    subject,
    text,
    html
  });
};

const sendPasswordResetEmail = async ({ to, code }) => {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@localhost";
  const transport = createSmtpTransport();
  const subject = process.env.MAIL_PASSWORD_RESET_SUBJECT || "Recete sifre sifirlama kodu";
  const text = `Sifre sifirlama kodunuz: ${code}\n\nBu kod ${passwordResetCodeTtlMinutes} dakika gecerlidir.`;
  const html = `<p>Sifre sifirlama kodunuz:</p><p style="font-size:22px;font-weight:bold;letter-spacing:4px">${code}</p><p>Bu kod <strong>${passwordResetCodeTtlMinutes} dakika</strong> gecerlidir.</p><p>Bu istegi siz yapmediyseniz bu e-postayi yok sayin.</p>`;

  if (!transport) {
    const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
    if (isProd) {
      const err = new Error("SMTP yapilandirilmamis");
      err.statusCode = 503;
      throw err;
    }
    console.warn(
      `[mail-service] SMTP_HOST yok; gelistirme modunda sifre sifirlama kodu: ${to} -> ${code}`
    );
    return;
  }

  await transport.sendMail({
    from,
    to,
    subject,
    text,
    html
  });
};

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use((req, _res, next) => {
  req.requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

app.get("/health", (_req, res) => {
  res.json({ service: "mail-service", ok: true });
});

/** Kayit icin e-postaya 6 haneli kod gonderir (onceki kod varsa silinir). */
app.post("/registration/send-code", async (req, res) => {
  const tag = `[mail-service][send-code][${req.requestId}]`;
  const emailRaw = req.body?.email;
  const email = normalizeEmail(emailRaw);

  if (!email) {
    return res.status(400).json({ message: "email zorunlu" });
  }
  if (!isValidEmailShape(email)) {
    return res.status(400).json({ message: "gecersiz e-posta adresi" });
  }

  const code = generateSixDigitCode();
  let codeHash;
  try {
    codeHash = await bcrypt.hash(code, 10);
  } catch (e) {
    console.error(`${tag} hash hatasi`, e.message);
    return res.status(500).json({ message: "kod olusturulamadi" });
  }

  const expiresAt = new Date(Date.now() + codeTtlMinutes * 60 * 1000);

  try {
    await pool.query("DELETE FROM mail_registration_codes WHERE email = $1", [email]);
    await pool.query(
      `INSERT INTO mail_registration_codes (email, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [email, codeHash, expiresAt]
    );
  } catch (e) {
    console.error(`${tag} veritabani`, e.message);
    return res.status(500).json({ message: "kod kaydedilemedi" });
  }

  try {
    await sendRegistrationEmail({ to: email, code });
  } catch (e) {
    const status = e.statusCode || 502;
    console.error(`${tag} e-posta gonderilemedi`, e.message);
    try {
      await pool.query("DELETE FROM mail_registration_codes WHERE email = $1", [email]);
    } catch (delErr) {
      console.error(`${tag} rollback silinemedi`, delErr.message);
    }
    return res.status(status).json({
      message: e.message || "e-posta gonderilemedi"
    });
  }

  console.log(`${tag} kod gonderildi`, { email });
  return res.status(200).json({ ok: true, message: "dogrulama kodu e-postaya gonderildi" });
});

/** Kod dogruysa tek kullanimlik kayit kaniti (JWT) doner. */
app.post("/registration/verify-code", async (req, res) => {
  const tag = `[mail-service][verify-code][${req.requestId}]`;
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").trim();

  if (!email || !code) {
    return res.status(400).json({ message: "email ve code zorunlu" });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: "dogrulama kodu 6 haneli olmali" });
  }

  let row;
  try {
    const result = await pool.query(
      "SELECT code_hash, expires_at FROM mail_registration_codes WHERE email = $1",
      [email]
    );
    row = result.rows[0];
  } catch (e) {
    console.error(`${tag} veritabani`, e.message);
    return res.status(500).json({ message: "veritabani hatasi" });
  }

  if (!row) {
    return res.status(400).json({ message: "once dogrulama kodu isteyin veya kod suresi doldu" });
  }

  if (new Date(row.expires_at) < new Date()) {
    try {
      await pool.query("DELETE FROM mail_registration_codes WHERE email = $1", [email]);
    } catch (_e) {
      /* ignore */
    }
    return res.status(400).json({ message: "dogrulama kodunun suresi doldu, yeni kod isteyin" });
  }

  const match = await bcrypt.compare(code, row.code_hash);
  if (!match) {
    return res.status(400).json({ message: "dogrulama kodu hatali" });
  }

  try {
    await pool.query("DELETE FROM mail_registration_codes WHERE email = $1", [email]);
  } catch (e) {
    console.error(`${tag} kod satiri silinemedi`, e.message);
    return res.status(500).json({ message: "dogrulama tamamlanamadi" });
  }

  const jti = crypto.randomUUID();
  const registration_token = jwt.sign(
    { email, purpose: "email_registration" },
    registerJwtSecret,
    { expiresIn: proofTtl, jwtid: jti }
  );

  console.log(`${tag} dogrulama basarili`, { email });
  return res.json({ ok: true, registration_token });
});

/** Sifre sifirlama icin e-postaya 6 haneli kod gonderir. */
app.post("/password-reset/send-code", async (req, res) => {
  const tag = `[mail-service][password-reset-send][${req.requestId}]`;
  const email = normalizeEmail(req.body?.email);

  if (!email) {
    return res.status(400).json({ message: "email zorunlu" });
  }
  if (!isValidEmailShape(email)) {
    return res.status(400).json({ message: "gecersiz e-posta adresi" });
  }

  const code = generateSixDigitCode();
  let codeHash;
  try {
    codeHash = await bcrypt.hash(code, 10);
  } catch (e) {
    console.error(`${tag} hash hatasi`, e.message);
    return res.status(500).json({ message: "kod olusturulamadi" });
  }

  const expiresAt = new Date(Date.now() + passwordResetCodeTtlMinutes * 60 * 1000);

  try {
    await pool.query("DELETE FROM mail_password_reset_codes WHERE email = $1", [email]);
    await pool.query(
      `INSERT INTO mail_password_reset_codes (email, code_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [email, codeHash, expiresAt]
    );
  } catch (e) {
    console.error(`${tag} veritabani`, e.message);
    return res.status(500).json({ message: "kod kaydedilemedi" });
  }

  try {
    await sendPasswordResetEmail({ to: email, code });
  } catch (e) {
    const status = e.statusCode || 502;
    console.error(`${tag} e-posta gonderilemedi`, e.message);
    try {
      await pool.query("DELETE FROM mail_password_reset_codes WHERE email = $1", [email]);
    } catch (delErr) {
      console.error(`${tag} rollback silinemedi`, delErr.message);
    }
    return res.status(status).json({
      message: e.message || "e-posta gonderilemedi"
    });
  }

  console.log(`${tag} kod gonderildi`, { email });
  return res.status(200).json({ ok: true, message: "dogrulama kodu e-postaya gonderildi" });
});

/** Kod dogruysa sifre degisikligi kaniti (JWT) doner. */
app.post("/password-reset/verify-code", async (req, res) => {
  const tag = `[mail-service][password-reset-verify][${req.requestId}]`;
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").trim();

  if (!email || !code) {
    return res.status(400).json({ message: "email ve code zorunlu" });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: "dogrulama kodu 6 haneli olmali" });
  }

  let row;
  try {
    const result = await pool.query(
      "SELECT code_hash, expires_at FROM mail_password_reset_codes WHERE email = $1",
      [email]
    );
    row = result.rows[0];
  } catch (e) {
    console.error(`${tag} veritabani`, e.message);
    return res.status(500).json({ message: "veritabani hatasi" });
  }

  if (!row) {
    return res.status(400).json({ message: "once dogrulama kodu isteyin veya kod suresi doldu" });
  }

  if (new Date(row.expires_at) < new Date()) {
    try {
      await pool.query("DELETE FROM mail_password_reset_codes WHERE email = $1", [email]);
    } catch (_e) {
      /* ignore */
    }
    return res.status(400).json({ message: "dogrulama kodunun suresi doldu, yeni kod isteyin" });
  }

  const match = await bcrypt.compare(code, row.code_hash);
  if (!match) {
    return res.status(400).json({ message: "dogrulama kodu hatali" });
  }

  try {
    await pool.query("DELETE FROM mail_password_reset_codes WHERE email = $1", [email]);
  } catch (e) {
    console.error(`${tag} kod satiri silinemedi`, e.message);
    return res.status(500).json({ message: "dogrulama tamamlanamadi" });
  }

  const jti = crypto.randomUUID();
  const reset_token = jwt.sign(
    { email, purpose: "password_reset" },
    registerJwtSecret,
    { expiresIn: passwordResetProofTtl, jwtid: jti }
  );

  console.log(`${tag} dogrulama basarili`, { email });
  return res.json({ ok: true, reset_token });
});

const start = async () => {
  await initMailDatabase(pool);
  app.listen(port, () => {
    console.log(`Mail service running on ${port}`);
  });
};

start().catch((err) => {
  console.error("[mail-service] Baslatilamadi:", err.message);
  process.exit(1);
});
