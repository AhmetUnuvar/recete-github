/**
 * Uretim sunucusu (api-gateway :4000). Yerelde farkli adres icin mobile-app/.env:
 * EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:4000
 */
const raw =
  process.env.EXPO_PUBLIC_API_BASE_URL || "http://89.167.4.8:4000";

export const API_BASE_URL = raw.replace(/\/$/, "");
