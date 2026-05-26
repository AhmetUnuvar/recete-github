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

export const getStockCategories = async (userId) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }

  const response = await fetch(
    `${API_BASE_URL}/stock/categories?user_id=${encodeURIComponent(userId)}`
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Kategoriler getirilemedi.");
  }
  return data;
};

export const getUnits = async (userId) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }

  const response = await fetch(
    `${API_BASE_URL}/stock/units?user_id=${encodeURIComponent(userId)}`
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Birimler getirilemedi.");
  }
  return data;
};

export const getCurrencies = async () => {
  const response = await fetch(`${API_BASE_URL}/stock/currencies`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Para birimleri getirilemedi.");
  }
  return data;
};

export const getSellers = async (userId) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }
  const response = await fetch(
    `${API_BASE_URL}/stock/sellers?user_id=${encodeURIComponent(userId)}`
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Saticilar getirilemedi.");
  }
  return Array.isArray(data) ? data : [];
};

export const createSeller = async (sellerName, userId) => {
  if (!sellerName?.trim()) {
    throw new Error("Satici adi bos olamaz.");
  }
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }
  const response = await fetch(`${API_BASE_URL}/stock/sellers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      seller_name: sellerName.trim()
    })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Satici olusturulamadi.");
  }
  return data;
};

export const getStocks = async (userId) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }

  const response = await fetch(
    `${API_BASE_URL}/stock/stocks?user_id=${encodeURIComponent(userId)}`
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Stoklar getirilemedi.");
  }
  return data;
};

export const createStockCategory = async (stockCategoryName, userId) => {
  if (!stockCategoryName?.trim()) {
    throw new Error("Kategori adi bos olamaz.");
  }
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }

  const response = await fetch(`${API_BASE_URL}/stock/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      stock_category_name: stockCategoryName.trim()
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Kategori olusturulamadi.");
  }

  return data;
};

export const createUnit = async (unitName, userId) => {
  if (!unitName?.trim()) {
    throw new Error("Birim adi bos olamaz.");
  }
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }

  const response = await fetch(`${API_BASE_URL}/stock/units`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      unit_name: unitName.trim()
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Birim olusturulamadi.");
  }
  return data;
};

export const createStock = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/stock/stocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Stok kaydedilemedi.";
    throw new Error(message);
  }
  return data;
};

export const setStockAlert = async ({ userId, stockId, stockAlert }) => {
  if (!userId || !stockId) {
    throw new Error("Kullanici veya stok bilgisi eksik.");
  }
  const body = { user_id: userId, stock_alert: stockAlert };
  const response = await fetch(`${API_BASE_URL}/stock/stocks/${encodeURIComponent(stockId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Stok uyarisi kaydedilemedi.");
  }
  return data;
};

export const updateStock = async ({ userId, stockId, stockName, stockQuantity, unitCost }) => {
  if (!userId || !stockId) {
    throw new Error("Kullanici veya stok bilgisi eksik.");
  }
  const response = await fetch(`${API_BASE_URL}/stock/stocks/${encodeURIComponent(stockId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      stock_name: stockName,
      stock_quantity: stockQuantity,
      unit_cost: unitCost
    })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Stok guncellenemedi.");
  }
  return data;
};

export const deleteStock = async ({ userId, stockId }) => {
  if (!userId || !stockId) {
    throw new Error("Kullanici veya stok bilgisi eksik.");
  }
  const response = await fetch(`${API_BASE_URL}/stock/stocks/${encodeURIComponent(stockId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Stok silinemedi.");
  }
  return data;
};

export const consumeStockForCustomer = async ({
  userId,
  stockId,
  quantity,
  buyerId,
  transactionName = null
}) => {
  if (!userId || !stockId || !buyerId || quantity === undefined) {
    throw new Error("Kullanici, stok, miktar ve musteri bilgisi zorunlu.");
  }
  const response = await fetch(`${API_BASE_URL}/stock/stocks/${encodeURIComponent(stockId)}/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      quantity,
      buyer_id: buyerId,
      transaction_name: transactionName ? String(transactionName).trim() : null
    })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Stoktan dusme islemi basarisiz.");
  }
  return data;
};
