const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createPool, initAuthDatabase, generateReferenceCode } = require("../database/database");

const app = express();
const port = process.env.PORT || 4001;
const pool = createPool();
const jwtSecret = process.env.JWT_SECRET || "super-secret-key";
const registerEmailJwtSecret =
  process.env.REGISTER_EMAIL_JWT_SECRET || "dev-register-email-jwt-change-me";
const mailServiceBase = (process.env.MAIL_SERVICE_URL || "http://localhost:4011").replace(/\/$/, "");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const getBearerUserId = (req) => {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  try {
    const claims = jwt.verify(match[1], jwtSecret);
    return claims.sub || null;
  } catch {
    return null;
  }
};

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
    let referenceCode = generateReferenceCode();
    let result;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        result = await pool.query(
          `INSERT INTO users_db(name, lastname, email, phone_number, password, reference_code)
           VALUES($1, $2, $3, $4, $5, $6)
           RETURNING id, name, lastname, email, phone_number, reference_code, created_at`,
          [name, lastname, emailNorm, phone_number, passwordHash, referenceCode]
        );
        break;
      } catch (insertErr) {
        if (insertErr.code === "23505" && attempt < 7) {
          referenceCode = generateReferenceCode();
          continue;
        }
        throw insertErr;
      }
    }
    if (!result) {
      throw new Error("referans kodu uretilemedi");
    }
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

/** Oturum acik kullanicinin profil bilgileri. */
app.get("/me", async (req, res) => {
  const actorId = getBearerUserId(req);
  if (!actorId) {
    return res.status(401).json({ message: "yetkisiz" });
  }
  try {
    const result = await pool.query(
      `SELECT id, name, lastname, email, phone_number, reference_code, created_at
       FROM users_db
       WHERE id = $1::uuid AND deleted_at IS NULL`,
      [actorId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "kullanici bulunamadi" });
    }
    const row = result.rows[0];
    return res.json({
      user_id: row.id,
      name: row.name,
      lastname: row.lastname,
      email: row.email,
      phone_number: row.phone_number,
      reference_code: row.reference_code
    });
  } catch (error) {
    return res.status(500).json({ message: "profil getirilemedi", detail: error.message });
  }
});

/**
 * Hesap sahibi (JWT) baska bir kullaniciyi referans kodu ile ortak erisim olarak ekler.
 * Eklenen kullanici (member) sahibin (owner) tum verilerine erisebilir.
 */
app.post("/shared-users", async (req, res) => {
  const ownerId = getBearerUserId(req);
  const referenceCode = String(req.body?.reference_code || "")
    .trim()
    .toUpperCase();
  if (!ownerId) {
    return res.status(401).json({ message: "yetkisiz" });
  }
  if (!referenceCode) {
    return res.status(400).json({ message: "reference_code zorunlu" });
  }

  try {
    const memberResult = await pool.query(
      `SELECT id, name, lastname, email, reference_code
       FROM users_db
       WHERE UPPER(reference_code) = $1 AND deleted_at IS NULL`,
      [referenceCode]
    );
    if (memberResult.rowCount === 0) {
      return res.status(404).json({ message: "referans kodu ile kullanici bulunamadi" });
    }
    const member = memberResult.rows[0];
    if (String(member.id) === String(ownerId)) {
      return res.status(400).json({ message: "kendi referans kodunuzu ekleyemezsiniz" });
    }

    const existing = await pool.query(
      `SELECT id FROM shared_account_access_db
       WHERE owner_user_id = $1::uuid AND member_user_id = $2::uuid AND deleted_at IS NULL`,
      [ownerId, member.id]
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ message: "bu kullanici zaten ortak kullanici olarak ekli" });
    }

    const insert = await pool.query(
      `INSERT INTO shared_account_access_db (owner_user_id, member_user_id)
       VALUES ($1::uuid, $2::uuid)
       RETURNING id, owner_user_id, member_user_id, created_at`,
      [ownerId, member.id]
    );
    return res.status(201).json({
      access: insert.rows[0],
      member: {
        user_id: member.id,
        name: member.name,
        lastname: member.lastname,
        email: member.email,
        reference_code: member.reference_code
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "ortak kullanici eklenemedi", detail: error.message });
  }
});

/** Hesap sahibinin ekledigi ortak kullanicilar. */
app.get("/shared-members", async (req, res) => {
  const ownerId = getBearerUserId(req);
  if (!ownerId) {
    return res.status(401).json({ message: "yetkisiz" });
  }
  try {
    const result = await pool.query(
      `SELECT a.id AS access_id, a.created_at,
              u.id AS user_id, u.name, u.lastname, u.email, u.reference_code
       FROM shared_account_access_db a
       JOIN users_db u ON u.id = a.member_user_id AND u.deleted_at IS NULL
       WHERE a.owner_user_id = $1::uuid AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC`,
      [ownerId]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "ortak kullanicilar listelenemedi", detail: error.message });
  }
});

/** Ortak kullanicinin erisebildigi hesaplar (sahipler). */
app.get("/shared-accounts", async (req, res) => {
  const memberId = getBearerUserId(req);
  if (!memberId) {
    return res.status(401).json({ message: "yetkisiz" });
  }
  try {
    const result = await pool.query(
      `SELECT a.id AS access_id, a.created_at,
              u.id AS owner_user_id, u.name, u.lastname, u.email
       FROM shared_account_access_db a
       JOIN users_db u ON u.id = a.owner_user_id AND u.deleted_at IS NULL
       WHERE a.member_user_id = $1::uuid AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC`,
      [memberId]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: "paylasilan hesaplar listelenemedi", detail: error.message });
  }
});

app.delete("/shared-users/:access_id", async (req, res) => {
  const ownerId = getBearerUserId(req);
  const accessId = req.params.access_id;
  if (!ownerId) {
    return res.status(401).json({ message: "yetkisiz" });
  }
  try {
    const result = await pool.query(
      `UPDATE shared_account_access_db
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1::uuid AND owner_user_id = $2::uuid AND deleted_at IS NULL
       RETURNING id`,
      [accessId, ownerId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "ortak erisim kaydi bulunamadi" });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: "ortak kullanici kaldirilamadi", detail: error.message });
  }
});

/** Gateway: actor, target user_id icin veri islemi yapabilir mi? */
app.post("/access/check", async (req, res) => {
  const { actor_user_id, target_user_id } = req.body || {};
  if (!actor_user_id || !target_user_id) {
    return res.status(400).json({ message: "actor_user_id ve target_user_id zorunlu" });
  }
  if (String(actor_user_id) === String(target_user_id)) {
    return res.json({ allowed: true });
  }
  try {
    const result = await pool.query(
      `SELECT 1 FROM shared_account_access_db
       WHERE owner_user_id = $1::uuid AND member_user_id = $2::uuid AND deleted_at IS NULL
       LIMIT 1`,
      [target_user_id, actor_user_id]
    );
    return res.json({ allowed: result.rowCount > 0 });
  } catch (error) {
    return res.status(500).json({ message: "erisim kontrolu basarisiz", detail: error.message });
  }
});

/** Profil: mevcut sifre dogrulanir, yeni sifre kaydedilir (e-posta gerekmez). */
app.post("/change-password", async (req, res) => {
  const requestTag = `[auth-service][change-password][${req.requestId}]`;
  const { user_id, current_password, new_password } = req.body;
  const actorId = getBearerUserId(req);

  if (!user_id || !current_password || !new_password) {
    return res.status(400).json({ message: "user_id, current_password ve new_password zorunlu" });
  }
  if (!actorId || String(actorId) !== String(user_id)) {
    return res.status(403).json({ message: "sadece kendi sifrenizi degistirebilirsiniz" });
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
