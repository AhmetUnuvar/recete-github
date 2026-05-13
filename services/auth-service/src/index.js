const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createPool, initAuthDatabase } = require("../database/database");

const app = express();
const port = process.env.PORT || 4001;
const pool = createPool();
const jwtSecret = process.env.JWT_SECRET || "super-secret-key";
const registerEmailJwtSecret =
  process.env.REGISTER_EMAIL_JWT_SECRET || "dev-register-email-jwt-change-me";
const mailServiceBase = (process.env.MAIL_SERVICE_URL || "http://localhost:4011").replace(/\/$/, "");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use((req, _res, next) => {
  req.requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

app.get("/health", (_req, res) => {
  res.json({ service: "auth-service", ok: true });
});

app.post("/register", async (req, res) => {
  const requestTag = `[auth-service][register][${req.requestId}]`;
  const { name, lastname, email, phone_number, password, registration_token } = req.body;
  const emailNorm = normalizeEmail(email);
  console.log(`${requestTag} istek alindi`, { email: emailNorm, phone_number });

  if (!name || !lastname || !email || !phone_number || !password) {
    console.warn(`${requestTag} zorunlu alan eksik`);
    return res.status(400).json({
      message: "name, lastname, email, phone_number ve password zorunlu"
    });
  }

  if (!registration_token) {
    console.warn(`${requestTag} e-posta dogrulama kaniti yok`);
    return res.status(400).json({
      message: "e-posta dogrulamasi zorunlu: once dogrulama kodunu alip dogrulayin"
    });
  }

  let regClaims;
  try {
    regClaims = jwt.verify(registration_token, registerEmailJwtSecret);
  } catch (_err) {
    console.warn(`${requestTag} gecersiz veya suresi dolmus dogrulama kaniti`);
    return res.status(400).json({
      message: "e-posta dogrulamasi gecersiz veya suresi dolmus; kodu tekrar dogrulayin"
    });
  }

  if (regClaims.purpose !== "email_registration" || !regClaims.email) {
    console.warn(`${requestTag} dogrulama token icerigi hatali`);
    return res.status(400).json({ message: "e-posta dogrulama kaniti gecersiz" });
  }

  if (normalizeEmail(regClaims.email) !== emailNorm) {
    console.warn(`${requestTag} token email ile form email uyusmuyor`);
    return res.status(400).json({
      message: "dogrulama farkli bir e-posta icin yapildi; ayni adresi kullanin"
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users_db(name, lastname, email, phone_number, password)
       VALUES($1, $2, $3, $4, $5)
       RETURNING id, name, lastname, email, phone_number, created_at`,
      [name, lastname, emailNorm, phone_number, passwordHash]
    );
    console.log(`${requestTag} kullanici olusturuldu`, {
      userId: result.rows[0].id,
      email: result.rows[0].email
    });
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(`${requestTag} kullanici olusturulamadi`, {
      message: error.message,
      code: error.code
    });
    return res.status(400).json({ message: "kullanici olusturulamadi", detail: error.message });
  }
});

app.post("/login", async (req, res) => {
  const requestTag = `[auth-service][login][${req.requestId}]`;
  const { email, password } = req.body;
  const emailNorm = normalizeEmail(email);
  console.log(`${requestTag} istek alindi`, { email: emailNorm });

  if (!email || !password) {
    console.warn(`${requestTag} zorunlu alan eksik`);
    return res.status(400).json({ message: "email ve password zorunlu" });
  }

  let user;
  try {
    const result = await pool.query(
      "SELECT id, email, password FROM users_db WHERE LOWER(TRIM(email)) = $1 AND deleted_at IS NULL",
      [emailNorm]
    );
    user = result.rows[0];
  } catch (error) {
    console.error(`${requestTag} veritabani sorgu hatasi`, {
      message: error.message,
      code: error.code
    });
    return res.status(500).json({ message: "veritabani hatasi" });
  }

  if (!user) {
    console.warn(`${requestTag} kullanici bulunamadi`);
    return res.status(401).json({ message: "gecersiz kullanici" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    console.warn(`${requestTag} sifre hatali`);
    return res.status(401).json({ message: "gecersiz sifre" });
  }

  const token = jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: "7d" });
  console.log(`${requestTag} giris basarili`, { userId: user.id, email: user.email });
  return res.json({ token, user_id: user.id, email: user.email });
});

const isValidEmailShape = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * users_db'de e-posta varsa mail-service ile dogrulama kodu gonderir.
 * Yoksa 404 ve "Kullanici bulunamadi." mesaji doner.
 */
app.post("/forgot-password/send-code", async (req, res) => {
  const requestTag = `[auth-service][forgot-send][${req.requestId}]`;
  const emailNorm = normalizeEmail(req.body?.email);

  if (!emailNorm || !isValidEmailShape(emailNorm)) {
    return res.status(400).json({ message: "gecerli bir e-posta adresi girin" });
  }

  let userExists = false;
  try {
    const r = await pool.query(
      "SELECT 1 FROM users_db WHERE LOWER(TRIM(email)) = $1 AND deleted_at IS NULL LIMIT 1",
      [emailNorm]
    );
    userExists = r.rowCount > 0;
  } catch (error) {
    console.error(`${requestTag} veritabani`, error.message);
    return res.status(500).json({ message: "islem yapilamadi" });
  }

  if (!userExists) {
    console.log(`${requestTag} hesap yok`, { email: emailNorm });
    return res.status(404).json({ message: "Kullanici bulunamadi." });
  }

  try {
    const resp = await fetch(`${mailServiceBase}/password-reset/send-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailNorm })
    });
    const raw = await resp.text();
    if (!resp.ok) {
      let detail = raw;
      try {
        const j = JSON.parse(raw);
        detail = j.message || raw;
      } catch (_e) {
        /* ignore */
      }
      console.error(`${requestTag} mail-service hata`, resp.status, detail);
      return res.status(502).json({ message: detail || "kod gonderilemedi, sonra tekrar deneyin" });
    }
  } catch (error) {
    console.error(`${requestTag} mail-service ulasim`, error.message);
    return res.status(502).json({ message: "eposta servisine ulasilamadi" });
  }

  console.log(`${requestTag} kod istegi iletildi`, { email: emailNorm });
  return res.status(200).json({ ok: true });
});

/** Mail dogrulamasindan gelen reset_token ile yeni sifreyi kaydeder. */
app.post("/forgot-password/complete", async (req, res) => {
  const requestTag = `[auth-service][forgot-complete][${req.requestId}]`;
  const { email, reset_token, new_password } = req.body;
  const emailNorm = normalizeEmail(email);

  if (!emailNorm || !reset_token || !new_password) {
    return res.status(400).json({ message: "email, reset_token ve new_password zorunlu" });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ message: "sifre en az 6 karakter olmali" });
  }

  let claims;
  try {
    claims = jwt.verify(reset_token, registerEmailJwtSecret);
  } catch (_err) {
    console.warn(`${requestTag} token gecersiz veya suresi doldu`);
    return res.status(400).json({ message: "dogrulama suresi doldu veya kod kaniti gecersiz; yeniden deneyin" });
  }

  if (claims.purpose !== "password_reset" || !claims.email) {
    return res.status(400).json({ message: "token gecersiz" });
  }

  if (normalizeEmail(claims.email) !== emailNorm) {
    return res.status(400).json({ message: "e-posta adresi dogrulama ile uyusmuyor" });
  }

  try {
    const passwordHash = await bcrypt.hash(new_password, 10);
    const result = await pool.query(
      `UPDATE users_db SET password = $1, updated_at = NOW()
       WHERE LOWER(TRIM(email)) = $2 AND deleted_at IS NULL
       RETURNING id`,
      [passwordHash, emailNorm]
    );
    if (result.rowCount === 0) {
      return res.status(400).json({ message: "hesap bulunamadi" });
    }
    console.log(`${requestTag} sifre guncellendi`, { userId: result.rows[0].id, email: emailNorm });
    return res.json({ ok: true, message: "sifreniz guncellendi, giris yapabilirsiniz" });
  } catch (error) {
    console.error(`${requestTag} guncelleme hatasi`, error.message);
    return res.status(500).json({ message: "sifre guncellenemedi" });
  }
});

/** Profil: mevcut sifre dogrulanir, yeni sifre kaydedilir (e-posta gerekmez). */
app.post("/change-password", async (req, res) => {
  const requestTag = `[auth-service][change-password][${req.requestId}]`;
  const { user_id, current_password, new_password } = req.body;

  if (!user_id || !current_password || !new_password) {
    return res.status(400).json({ message: "user_id, current_password ve new_password zorunlu" });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ message: "yeni sifre en az 6 karakter olmali" });
  }

  let user;
  try {
    const result = await pool.query(
      "SELECT id, password FROM users_db WHERE id = $1::uuid AND deleted_at IS NULL",
      [user_id]
    );
    user = result.rows[0];
  } catch (error) {
    console.error(`${requestTag} veritabani`, error.message);
    return res.status(500).json({ message: "veritabani hatasi" });
  }

  if (!user) {
    return res.status(404).json({ message: "kullanici bulunamadi" });
  }

  const valid = await bcrypt.compare(current_password, user.password);
  if (!valid) {
    console.warn(`${requestTag} mevcut sifre hatali`);
    return res.status(401).json({ message: "mevcut sifre hatali" });
  }

  try {
    const passwordHash = await bcrypt.hash(new_password, 10);
    await pool.query(
      "UPDATE users_db SET password = $1, updated_at = NOW() WHERE id = $2::uuid AND deleted_at IS NULL",
      [passwordHash, user_id]
    );
    console.log(`${requestTag} sifre guncellendi`, { userId: user_id });
    return res.json({ ok: true, message: "sifre guncellendi" });
  } catch (error) {
    console.error(`${requestTag} guncelleme hatasi`, error.message);
    return res.status(500).json({ message: "sifre guncellenemedi" });
  }
});

const start = async () => {
  await initAuthDatabase(pool);
  app.listen(port, () => {
    console.log(`Auth service running on ${port}`);
  });
};

start().catch((error) => {
  console.error("[auth-service] Baslatilamadi:", error.message);
  process.exit(1);
});
