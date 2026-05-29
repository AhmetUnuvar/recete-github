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

const throwUnlessOk = (response, data, defaultMessage) => {
  if (!response.ok) {
    const msg = data.message || defaultMessage;
    const detail = typeof data.detail === "string" && data.detail ? data.detail : "";
    throw new Error(detail ? `${msg} (${detail})` : msg);
  }
};

export const getBalances = async (userId) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }
  const response = await apiFetch(
    `/receivables-payables/balances?user_id=${encodeURIComponent(userId)}`
  );
  const data = await parseResponseBody(response);
  throwUnlessOk(response, data, "Borclar alacaklar listelenemedi.");
  return Array.isArray(data) ? data : [];
};

export const settleBalance = async ({ userId, balanceId, amount }) => {
  if (!userId || !balanceId) {
    throw new Error("Kullanici veya kayit bilgisi eksik.");
  }
  if (amount === undefined || amount === null || amount === "") {
    throw new Error("Tutar zorunlu.");
  }
  const response = await apiFetch(
    `/receivables-payables/balances/${encodeURIComponent(balanceId)}/settle`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, amount })
    }
  );
  const data = await parseResponseBody(response);
  throwUnlessOk(response, data, "Islem tamamlanamadi.");
  return data;
};

export const updateBalancePaymentDate = async ({ userId, balanceId, payment_date }) => {
  if (!userId || !balanceId) {
    throw new Error("Kullanici veya kayit bilgisi eksik.");
  }
  const body = { user_id: userId, payment_date };
  const response = await apiFetch(
    `/receivables-payables/balances/${encodeURIComponent(balanceId)}/payment-date`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const data = await parseResponseBody(response);
  throwUnlessOk(response, data, "Tarih guncellenemedi.");
  return data;
};

/** Kalan tutar ve/veya tahsil/odeme tarihini gunceller (en az bir alan dolu olmali). */
export const patchBalance = async ({ userId, balanceId, remaining_amount, payment_date }) => {
  if (!userId || !balanceId) {
    throw new Error("Kullanici veya kayit bilgisi eksik.");
  }
  const body = { user_id: userId };
  if (remaining_amount !== undefined) {
    body.remaining_amount = remaining_amount;
  }
  if (payment_date !== undefined) {
    body.payment_date = payment_date;
  }
  if (Object.keys(body).length <= 1) {
    throw new Error("Guncellenecek alan yok.");
  }
  const response = await apiFetch(
    `/receivables-payables/balances/${encodeURIComponent(balanceId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const data = await parseResponseBody(response);
  throwUnlessOk(response, data, "Kayit guncellenemedi.");
  return data;
};
