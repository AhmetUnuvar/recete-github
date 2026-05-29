const jwt = require("jsonwebtoken");
const http = require("http");
const Redis = require("ioredis");

/** Çalışan → işveren erişim sonucu 5 dakika cache'lenir. */
const ACCESS_CACHE_TTL_SECONDS = 300;

let redisClient = null;
const getRedis = () => {
  if (!redisClient) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    redisClient = new Redis(url, { lazyConnect: true, enableOfflineQueue: false });
    redisClient.on("error", (err) => {
      console.warn("[api-gateway][access-cache] Redis hatasi (cache devre disi):", err.message);
    });
  }
  return redisClient;
};

const getCachedAccess = async (actorId, targetId) => {
  try {
    const val = await getRedis().get(`access:${actorId}:${targetId}`);
    if (val === "1") return true;
    if (val === "0") return false;
    return null;
  } catch {
    return null;
  }
};

const setCachedAccess = async (actorId, targetId, allowed) => {
  try {
    await getRedis().set(`access:${actorId}:${targetId}`, allowed ? "1" : "0", "EX", ACCESS_CACHE_TTL_SECONDS);
  } catch {
    /* cache yazılamazsa devam et */
  }
};

/** Çalışan bir hesaptan çıkarıldığında cache'i temizlemek için kullanılır (opsiyonel). */
const invalidateAccessCache = async (actorId, targetId) => {
  try {
    await getRedis().del(`access:${actorId}:${targetId}`);
  } catch {
    /* ignore */
  }
};

const PUBLIC_PATHS = new Set([
  "/health",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password/send-code",
  "/auth/forgot-password/complete"
]);

const isPublicPath = (path, method) => {
  if (PUBLIC_PATHS.has(path)) return true;
  if (path.startsWith("/mail/")) return true;
  if (method === "GET" && path === "/calc/kdv-rates") return true;
  return false;
};

const isAuthManagementPath = (path) =>
  path === "/auth/me" ||
  path === "/auth/shared-users" ||
  path === "/auth/shared-accounts" ||
  path === "/auth/shared-members" ||
  path.startsWith("/auth/shared-users/") ||
  path === "/auth/access/check";

const extractTargetUserId = (req) => {
  if (req.query?.user_id) return String(req.query.user_id);
  if (req.body?.user_id) return String(req.body.user_id);
  return null;
};

const checkAccessViaAuth = (actorUserId, targetUserId, authServiceUrl) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify({ actor_user_id: actorUserId, target_user_id: targetUserId });
    const url = new URL("/access/check", authServiceUrl.replace(/\/$/, ""));
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 5000
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const data = raw ? JSON.parse(raw) : {};
            resolve(res.statusCode >= 200 && res.statusCode < 300 && data.allowed === true);
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("access check timeout"));
    });
    req.write(payload);
    req.end();
  });

const createAccessMiddleware = ({ jwtSecret, authServiceUrl }) => {
  return async (req, res, next) => {
    const path = req.path || req.url;
    if (isPublicPath(path, req.method)) {
      return next();
    }

    const authHeader = req.headers.authorization || "";
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!match) {
      return res.status(401).json({ message: "yetkisiz: oturum gerekli" });
    }

    let actorUserId;
    try {
      const claims = jwt.verify(match[1], jwtSecret);
      actorUserId = claims.sub;
    } catch {
      return res.status(401).json({ message: "yetkisiz: gecersiz oturum" });
    }

    if (!actorUserId) {
      return res.status(401).json({ message: "yetkisiz" });
    }

    req.actorUserId = actorUserId;

    if (isAuthManagementPath(path)) {
      return next();
    }

    const targetUserId = extractTargetUserId(req);
    if (!targetUserId) {
      return next();
    }

    if (String(actorUserId) === String(targetUserId)) {
      return next();
    }

    try {
      const cached = await getCachedAccess(actorUserId, targetUserId);
      if (cached === true) return next();
      if (cached === false) return res.status(403).json({ message: "bu hesaba erisim yetkiniz yok" });

      const allowed = await checkAccessViaAuth(actorUserId, targetUserId, authServiceUrl);
      await setCachedAccess(actorUserId, targetUserId, allowed);
      if (!allowed) {
        return res.status(403).json({ message: "bu hesaba erisim yetkiniz yok" });
      }
      return next();
    } catch (error) {
      console.error("[api-gateway] access check failed:", error.message);
      return res.status(503).json({ message: "erisim kontrolu yapilamadi" });
    }
  };
};

module.exports = { createAccessMiddleware, isPublicPath, invalidateAccessCache };
