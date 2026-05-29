/**
 * Load Test — 20.000 istek, 3 senaryo
 *
 * 1. Health endpoint    — auth yok, baseline
 * 2. Owner isteği       — actor === target (middleware short-circuit, Redis yok)
 * 3. Çalışan isteği     — actor !== target (Redis cache devreye girer)
 */

const http = require("http");
const crypto = require("crypto");

// --- JWT üretimi (jsonwebtoken bağımlılığı olmadan saf Node.js) ---
const JWT_SECRET = "super-secret-key";

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function makeJwt(sub) {
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    sub,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  });
  const sig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${payload}.${sig}`;
}

// --- HTTP isteği gönder ---
function request({ path, token }) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const options = {
      hostname: "localhost",
      port: 4000,
      path,
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    };
    const req = http.request(options, (res) => {
      res.resume();
      res.on("end", () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({ status: res.statusCode, ms });
      });
    });
    req.on("error", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ status: 0, ms });
    });
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ status: 0, ms: 10000 });
    });
    req.end();
  });
}

// --- Paralel havuz ---
async function runBatch(tasks, concurrency) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return results;
}

// --- İstatistik ---
function stats(results, label) {
  const ok = results.filter((r) => r.status >= 200 && r.status < 500);
  const err = results.filter((r) => r.status === 0);
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => times[Math.floor((p / 100) * times.length)] ?? 0;

  const total = results.length;
  const success = results.filter((r) => r.status === 200 || r.status === 404 || r.status === 401 || r.status === 403).length;
  const avg = times.length ? times.reduce((s, v) => s + v, 0) / times.length : 0;

  console.log(`\n📊 ${label}`);
  console.log(`   Toplam istek  : ${total}`);
  console.log(`   Başarılı (2xx/3xx/4xx): ${success} (${((success / total) * 100).toFixed(1)}%)`);
  console.log(`   Bağlantı hatası: ${err.length}`);
  console.log(`   Ortalama süre  : ${avg.toFixed(1)} ms`);
  console.log(`   P50            : ${pct(50).toFixed(1)} ms`);
  console.log(`   P95            : ${pct(95).toFixed(1)} ms`);
  console.log(`   P99            : ${pct(99).toFixed(1)} ms`);
  console.log(`   Min / Max      : ${(times[0] ?? 0).toFixed(1)} / ${(times[times.length - 1] ?? 0).toFixed(1)} ms`);
}

// --- Test senaryoları ---
const TOTAL = 20000;
const CONCURRENCY = 250;

async function main() {
  console.log("=".repeat(60));
  console.log("  RECETE UYGULAMASI LOAD TEST — 20.000 İSTEK");
  console.log("=".repeat(60));
  console.log(`  Toplam istek : ${TOTAL.toLocaleString()}`);
  console.log(`  Eş zamanlılık: ${CONCURRENCY}`);

  // Sabit kullanıcı id'leri
  const ownerUuid  = "a1b2c3d4-0000-0000-0000-000000000001";
  const actorUuid  = "b2c3d4e5-0000-0000-0000-000000000002"; // çalışan
  const ownerToken = makeJwt(ownerUuid);
  const actorToken = makeJwt(actorUuid);

  // ── SENARYO 1: Health (auth yok) ──────────────────────────────
  console.log(`\n⏳ Senaryo 1: /health — auth yok (baseline)...`);
  const t1start = Date.now();
  const r1 = await runBatch(
    Array.from({ length: TOTAL }, () => () => request({ path: "/health" })),
    CONCURRENCY
  );
  const t1elapsed = ((Date.now() - t1start) / 1000).toFixed(1);
  stats(r1, `Senaryo 1 — Health (${TOTAL.toLocaleString()} istek, ${t1elapsed}s)`);
  console.log(`   RPS            : ${(TOTAL / t1elapsed).toFixed(0)} req/s`);

  // ── SENARYO 2: Sahip isteği (actor === target, short-circuit) ──
  console.log(`\n⏳ Senaryo 2: Gateway owner short-circuit (actor === target)...`);
  const t2start = Date.now();
  const r2 = await runBatch(
    Array.from({ length: TOTAL }, () => () =>
      request({ path: `/stock/stocks?user_id=${ownerUuid}`, token: ownerToken })
    ),
    CONCURRENCY
  );
  const t2elapsed = ((Date.now() - t2start) / 1000).toFixed(1);
  stats(r2, `Senaryo 2 — Owner short-circuit (${TOTAL.toLocaleString()} istek, ${t2elapsed}s)`);
  console.log(`   RPS            : ${(TOTAL / t2elapsed).toFixed(0)} req/s`);

  // ── SENARYO 3: Çalışan isteği (actor !== target → Redis cache) ─
  // İlk istek auth-service'e gider (cache miss), sonrakiler Redis'ten döner
  console.log(`\n⏳ Senaryo 3: Çalışan isteği (actor !== target, Redis cache)...`);
  const t3start = Date.now();
  const r3 = await runBatch(
    Array.from({ length: TOTAL }, () => () =>
      request({ path: `/stock/stocks?user_id=${ownerUuid}`, token: actorToken })
    ),
    CONCURRENCY
  );
  const t3elapsed = ((Date.now() - t3start) / 1000).toFixed(1);
  stats(r3, `Senaryo 3 — Çalışan + Redis cache (${TOTAL.toLocaleString()} istek, ${t3elapsed}s)`);
  console.log(`   RPS            : ${(TOTAL / t3elapsed).toFixed(0)} req/s`);

  // ── KARŞILAŞTIRMA ──────────────────────────────────────────────
  const p95 = (results) => {
    const times = results.map((r) => r.ms).sort((a, b) => a - b);
    return times[Math.floor(0.95 * times.length)] ?? 0;
  };

  console.log("\n" + "=".repeat(60));
  console.log("  KARŞILAŞTIRMA ÖZETİ");
  console.log("=".repeat(60));
  console.log(
    `  Health (baseline)        P95: ${p95(r1).toFixed(1)} ms  | RPS: ${(TOTAL / t1elapsed).toFixed(0)}`
  );
  console.log(
    `  Owner short-circuit      P95: ${p95(r2).toFixed(1)} ms  | RPS: ${(TOTAL / t2elapsed).toFixed(0)}`
  );
  console.log(
    `  Çalışan + Redis cache    P95: ${p95(r3).toFixed(1)} ms  | RPS: ${(TOTAL / t3elapsed).toFixed(0)}`
  );
  console.log("=".repeat(60));
  console.log("\n✅ Test tamamlandı.\n");
}

main().catch(console.error);
