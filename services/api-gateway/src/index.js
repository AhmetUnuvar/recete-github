const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const port = process.env.PORT || 4000;

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

app.get("/health", (_req, res) => {
  res.json({ service: "api-gateway", ok: true });
});

const createServiceProxy = (pathPrefix, target, pathRewriteRule) =>
  createProxyMiddleware({
    target,
    changeOrigin: true,
    proxyTimeout: 15000,
    timeout: 15000,
    ...(pathRewriteRule ? { pathRewrite: pathRewriteRule } : {}),
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

app.use(
  "/stock",
  createServiceProxy("/stock", stockService)
);

app.use(
  "/finance",
  createServiceProxy("/finance", financeService)
);

app.use(
  "/product",
  createServiceProxy("/product", productService)
);

app.use(
  "/calc",
  createServiceProxy("/calc", calcService)
);

app.use(
  "/transactions",
  createServiceProxy("/transactions", transactionsService)
);

app.use(
  "/customer",
  createServiceProxy("/customer", customerService)
);

app.use(
  "/table-maker",
  createServiceProxy("/table-maker", tableMakerService)
);

app.use("/notifications", createServiceProxy("/notifications", notificationService));

/** Alt servis rotalari /balances vb.; tam yol iletilirse 404 olmasin diye prefix kaldirilir. */
app.use(
  "/receivables-payables",
  createServiceProxy("/receivables-payables", receivablesPayablesService, {
    "^/receivables-payables": ""
  })
);

app.listen(port, "0.0.0.0", () => {
  console.log(`API Gateway listening on 0.0.0.0:${port}`);
});
