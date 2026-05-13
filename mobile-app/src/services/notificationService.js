import { API_BASE_URL } from "../constants/config";

const TARGET_PAGE_HOME = "ana sayfa";
const TARGET_PAGE_ADD_PRODUCT = "urun ekle";
const TARGET_PAGE_CUSTOMERS = "musteriler";
const TARGET_PAGE_FIXED_INCOME_EXPENSE = "sabit gelir gider";
const TARGET_PAGE_FIXED_MY_LIST = "sabit gelir giderlerim";
const TARGET_PAGE_STOCK_ADD = "stok ekle";
const TARGET_PAGE_MY_STOCKS = "stoklarim";
const TARGET_PAGE_MY_RECIPES = "urun recetelerim";

const parseBody = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_e) {
    return { message: text };
  }
};

export const getPendingNotificationsForPage = async ({ userId, targetPage = TARGET_PAGE_HOME }) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi yok.");
  }
  const q = new URLSearchParams({
    user_id: userId,
    target_page: targetPage
  });
  const response = await fetch(`${API_BASE_URL}/notifications/pending?${q.toString()}`);
  const data = await parseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Bildirimler alinamadi.");
  }
  return Array.isArray(data.notifications) ? data.notifications : [];
};

export const dismissNotification = async ({ userId, notificationId }) => {
  if (!userId || !notificationId) {
    throw new Error("Eksik parametre.");
  }
  const response = await fetch(`${API_BASE_URL}/notifications/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, notification_id: notificationId })
  });
  const data = await parseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Islem basarisiz.");
  }
  return data;
};

export {
  TARGET_PAGE_HOME,
  TARGET_PAGE_ADD_PRODUCT,
  TARGET_PAGE_CUSTOMERS,
  TARGET_PAGE_FIXED_INCOME_EXPENSE,
  TARGET_PAGE_FIXED_MY_LIST,
  TARGET_PAGE_STOCK_ADD,
  TARGET_PAGE_MY_STOCKS,
  TARGET_PAGE_MY_RECIPES
};
