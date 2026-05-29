import { API_BASE_URL } from "../constants/config";
import { apiFetch } from "./apiClient";

const parseResponseBody = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { message: text };
  }
};

export const getTransactions = async (userId, limit = 500) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }
  const response = await apiFetch(
    `/transactions/transactions?user_id=${encodeURIComponent(userId)}&limit=${encodeURIComponent(limit)}`
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Islemler getirilemedi.");
  }
  return Array.isArray(data) ? data : [];
};

export const getTransactionsByBuyer = async (userId, buyerId, limit = 500) => {
  if (!userId || !buyerId) {
    throw new Error("Kullanici veya musteri bilgisi eksik.");
  }
  const response = await apiFetch(
    `/transactions/transactions?user_id=${encodeURIComponent(userId)}&buyer_id=${encodeURIComponent(buyerId)}&limit=${encodeURIComponent(limit)}`
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Musteri islemleri getirilemedi.");
  }
  return Array.isArray(data) ? data : [];
};

export const createTransaction = async ({
  userId,
  amount,
  isIncome,
  buyerId = null,
  transactionName = null
}) => {
  if (!userId || amount === undefined || typeof isIncome !== "boolean") {
    throw new Error("Kullanici, amount ve isIncome zorunlu.");
  }
  const response = await apiFetch(`/transactions/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      amount,
      is_income: isIncome,
      buyer_id: buyerId || null,
      transaction_name: transactionName ? String(transactionName).trim() : null
    })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Islem kaydedilemedi.");
  }
  return data;
};

export const updateTransaction = async ({ userId, transactionId, amount, transactionName = null }) => {
  if (!userId || !transactionId || amount === undefined) {
    throw new Error("Kullanici, islem ve amount zorunlu.");
  }
  const response = await apiFetch(
    `/transactions/transactions/${encodeURIComponent(transactionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        amount,
        transaction_name: transactionName ? String(transactionName).trim() : null
      })
    }
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Islem guncellenemedi.");
  }
  return data;
};

export const deleteTransaction = async ({ userId, transactionId }) => {
  if (!userId || !transactionId) {
    throw new Error("Kullanici ve islem zorunlu.");
  }
  const response = await apiFetch(
    `/transactions/transactions/${encodeURIComponent(transactionId)}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId })
    }
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Islem silinemedi.");
  }
  return data;
};
