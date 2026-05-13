import { API_BASE_URL } from "../constants/config";

const parseResponseBody = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { message: text };
  }
};

export const createFixedRecord = async ({ userId, fixedName, isFixedIncome, amount, isDefault }) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }
  const response = await fetch(`${API_BASE_URL}/finance/fixed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      fixed_name: String(fixedName || "").trim(),
      is_fixed_income: Boolean(isFixedIncome),
      amount,
      ...(isDefault === true ? { is_default: true } : {})
    })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Sabit gelir/gider kaydedilemedi.");
  }
  return data;
};

export const getFixedRecords = async (userId) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }
  const response = await fetch(
    `${API_BASE_URL}/finance/fixed?user_id=${encodeURIComponent(userId)}`
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Sabit gelir/gider kayitlari getirilemedi.");
  }
  return Array.isArray(data) ? data : [];
};

export const updateFixedRecord = async ({ userId, fixedId, fixedName, amount, isDefault }) => {
  if (!userId || !fixedId) {
    throw new Error("Kullanici veya kayit bilgisi eksik.");
  }
  const response = await fetch(`${API_BASE_URL}/finance/fixed/${encodeURIComponent(fixedId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      fixed_name: String(fixedName || "").trim(),
      amount,
      ...(typeof isDefault === "boolean" ? { is_default: isDefault } : {})
    })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Sabit kayit guncellenemedi.");
  }
  return data;
};

export const deleteFixedRecord = async ({ userId, fixedId }) => {
  if (!userId || !fixedId) {
    throw new Error("Kullanici veya kayit bilgisi eksik.");
  }
  const response = await fetch(`${API_BASE_URL}/finance/fixed/${encodeURIComponent(fixedId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Sabit kayit silinemedi.");
  }
  return data;
};
