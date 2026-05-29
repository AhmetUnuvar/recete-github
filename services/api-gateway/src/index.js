const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const http = require("http");
const { Readable } = require("stream");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { createAccessMiddleware, invalidateAccessCache } = require("./accessMiddleware");

const app = express();
const port = process.env.PORT || 4000;
const jwtSecret = process.env.JWT_SECRET || "super-secret-key";

const makeAgent = () =>
  new http.Agent({ keepAlive: true, maxSockets: 200, maxFreeSockets: 20, timeout: 30000 });

const authService = process.env.AUTH_SERVICE_URL || "http://localhost:4001";
const mailService = process.env.MAIL_SERVICE_URL || "http://localhost:4011";
const stockService = process.env.STOCK_SERVICE_URL || "http://localhost:4002";
const financeService = process.env.FINANCE_SERVICE_URL || "http://localhost:4003";
const productService = process.env.PRODUCT_SERVICE_URL || "http://localhost:4004";
const calcService = process.env.CALC_SERVICE_URL || "http://localhost:4005";
const transactionsService = process.env.TRANSACTIONS_SERVICE_URL || "http://localhost:4006";
const customerService = process.env.CUSTOMER_SERVICE_URL || "http://localhost:4007";
const tableMakerService = process.env.TABLE_MAKER_SERVICE_URL || "http://localhost:4008";
const notificationService = process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4009";
const receivablesPayablesService =
  process.env.RECEIVABLES_PAYABLES_SERVICE_URL || "http://localhost:4010";

app.use(cors());
app.use(morgan("dev"));

/**
 * POST/PUT/PATCH icin body okunur; req.body (JSON) + req.pipe override edilir.
 * Proxy req.pipe(proxyReq) cagirdiginda, stream zaten tuketilmis olacagindan
 * req.pipe'i buffer'dan yeni bir Readable olusturup pipe ediyor.
 * GET/HEAD/DELETE: hicbir sey yapilmaz, proxy native stream kullanir.
 */
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
app.use((req, _res, next) => {
  if (!BODY_METHODS.has(req.method)) {
    req.body = {};
    return next();
  }
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks);
    if (rawBody.length > 0) {
      try {
        req.body = JSON.parse(rawBody.toString("utf8"));
      } catch {
        req.body = {};
      }
    } else {
      req.body = {};
    }
    req._rawBodyForProxy = rawBody;
    const origPipe = req.pipe.bind(req);
    req.pipe = (dest, opts) => {
      const replay = new Readable();
      if (rawBody.length > 0) replay.push(rawBody);
      replay.push(null);
      return replay.pipe(dest, opts);
    };
    next();
  });
  req.on("error", next);
});

app.get("/health", (_req, res) => {
  res.json({ service: "api-gateway", ok: true });
});

app.use(createAccessMiddleware({ jwtSecret, authServiceUrl: authService }));

/**
 * Calisan cikarildiginda gateway cache'ini temizler.
 * auth-service tarafindan DELETE /shared-users/:id sonrasinda cagirilabilir,
 * ya da client dogrudan bu endpoint'i cagirir.
 * Body: { actor_user_id, target_user_id }
 */
app.post("/internal/invalidate-access-cache", async (req, res) => {
  const { actor_user_id, target_user_id } = req.body || {};
  if (!actor_user_id || !target_user_id) {
    return res.status(400).json({ message: "actor_user_id ve target_user_id zorunlu" });
  }
  await invalidateAccessCache(actor_user_id, target_user_id);
  return res.json({ ok: true });
});

const createServiceProxy = (pathPrefix, target, pathRewriteRule) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: 15000,
    timeout: 15000,
    agent: makeAgent(),
    ...(pathRewriteRule ? { pathRewrite: pathRewriteRule } : {}),
    onProxyReq: (proxyReq, req) => {
      if (req._rawBodyForProxy !== undefined) {
        const buf = req._rawBodyForProxy;
        proxyReq.setHeader("Content-Type", req.headers["content-type"] || "application/json");
        proxyReq.setHeader("Content-Length", buf.length);
      }
    },
    onError: (err, req, res) => {
      console.error(`[api-gateway] proxy error for ${req.method} ${req.originalUrl}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({ message: "upstream service ulasilamiyor", detail: err.message });
      }
    }
  });

app.use(
  "/auth",
  createServiceProxy("/auth", authService, {
    "^/auth": ""
  })
);

app.use(
  "/mail",
  createServiceProxy("/mail", mailService, {
    "^/mail": ""
  })
);

app.use("/stock", createServiceProxy("/stock", stockService));
app.use("/finance", createServiceProxy("/finance", financeService));
app.use("/product", createServiceProxy("/product", productService));
app.use("/calc", createServiceProxy("/calc", calcService));
app.use("/transactions", createServiceProxy("/transactions", transactionsService));
app.use("/customer", createServiceProxy("/customer", customerService));
app.use("/table-maker", createServiceProxy("/table-maker", tableMakerService));
app.use("/notifications", createServiceProxy("/notifications", notificationService));

app.use(
  "/receivables-payables",
  createServiceProxy("/receivables-payables", receivablesPayablesService, {
    "^/receivables-payables": ""
  })
);

app.listen(port, "0.0.0.0", () => {
  console.log(`API Gateway listening on 0.0.0.0:${port}`);
});
