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

const formatErrorMessage = (data, fallback) => {
  const msg = data?.message;
  return typeof msg === "string" && msg.includes("<!DOCTYPE")
    ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
    : msg || fallback;
};

export const getCities = async () => {
  const response = await fetch(`${API_BASE_URL}/customer/cities`);
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(formatErrorMessage(data, "Şehirler getirilemedi."));
  }
  return Array.isArray(data) ? data : [];
};

export const getCustomers = async (userId, options = {}) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }
  const params = new URLSearchParams();
  params.set("user_id", userId);
  if (typeof options.isDone === "boolean") {
    params.set("is_done", String(options.isDone));
  }
  const response = await fetch(
    `${API_BASE_URL}/customer/customers?${params.toString()}`
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(formatErrorMessage(data, "Müşteriler getirilemedi."));
  }
  return Array.isArray(data) ? data : [];
};

export const setCustomerDoneStatus = async ({ userId, customerId, isDone }) => {
  if (!userId || !customerId || typeof isDone !== "boolean") {
    throw new Error("Kullanici, musteri ve durum bilgisi zorunlu.");
  }
  const response = await fetch(
    `${API_BASE_URL}/customer/customers/${encodeURIComponent(customerId)}/done`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        is_done: isDone
      })
    }
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(formatErrorMessage(data, "Müşteri durumu güncellenemedi."));
  }
  return data;
};

export const createCustomer = async (userId, payload) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }
  const response = await fetch(`${API_BASE_URL}/customer/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      customer_name: payload.customer_name,
      customer_id_number: payload.customer_id_number,
      customer_phone: payload.customer_phone,
      current_name: payload.current_name,
      customer_company_name: payload.customer_company_name,
      customer_city: payload.customer_city || null,
      customer_district: payload.customer_district,
      customer_address: payload.customer_address
    })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(formatErrorMessage(data, "Müşteri kaydedilemedi."));
  }
  return data;
};

export const updateCustomer = async (userId, customerId, payload) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }
  if (!customerId) {
    throw new Error("Musteri id bulunamadi.");
  }
  const response = await fetch(`${API_BASE_URL}/customer/customers/${encodeURIComponent(customerId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      customer_name: payload.customer_name,
      customer_id_number: payload.customer_id_number,
      customer_phone: payload.customer_phone,
      current_name: payload.current_name,
      customer_company_name: payload.customer_company_name,
      customer_city: payload.customer_city || null,
      customer_district: payload.customer_district,
      customer_address: payload.customer_address
    })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(formatErrorMessage(data, "Müşteri güncellenemedi."));
  }
  return data;
};

export const deleteCustomer = async (userId, customerId) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }
  if (!customerId) {
    throw new Error("Musteri id bulunamadi.");
  }
  const response = await fetch(`${API_BASE_URL}/customer/customers/${encodeURIComponent(customerId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(formatErrorMessage(data, "Müşteri silinemedi."));
  }
  return data;
};
