const Redis = require("ioredis");

let redis = null;

const getRedis = () => {
  if (!redis) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on("error", (err) => {
      console.warn("[cache][product-service] Redis hatasi:", err.message);
    });
  }
  return redis;
};

const getCache = async (key) => {
  try {
    const val = await getRedis().get(key);
    if (val == null) return null;
    return JSON.parse(val);
  } catch {
    return null;
  }
};

const setCache = async (key, value, ttlSeconds) => {
  try {
    await getRedis().set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Redis yoksa sessizce devam et
  }
};

const delCache = async (...keys) => {
  try {
    const valid = keys.filter(Boolean);
    if (valid.length > 0) await getRedis().del(...valid);
  } catch {
    // Redis yoksa sessizce devam et
  }
};

module.exports = { getCache, setCache, delCache };
