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

export const getOwnedProducts = async (userId) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }

  const response = await fetch(
    `${API_BASE_URL}/product/owned-products?user_id=${encodeURIComponent(userId)}`
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Uretilen urunler getirilemedi.";
    throw new Error(message);
  }
  return Array.isArray(data) ? data : [];
};

export const getProducts = async (userId) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }

  const response = await fetch(
    `${API_BASE_URL}/product/products?user_id=${encodeURIComponent(userId)}`
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Urunler getirilemedi.";
    throw new Error(message);
  }
  return Array.isArray(data) ? data : [];
};

export const createProduct = async ({ userId, productName, materials, price = 0, totalHours = 1 }) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }

  const response = await fetch(`${API_BASE_URL}/product/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      product_name: productName.trim(),
      materials,
      price,
      total_hours: totalHours
    })
  });

  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Urun kaydedilemedi.";
    throw new Error(message);
  }
  return data;
};

export const updateProduct = async ({ userId, productId, productName, materials, totalHours = 1 }) => {
  if (!userId || !productId) {
    throw new Error("Kullanici veya urun bilgisi eksik.");
  }
  const response = await fetch(`${API_BASE_URL}/product/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      product_name: String(productName || "").trim(),
      materials,
      total_hours: totalHours
    })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Urun guncellenemedi.";
    throw new Error(message);
  }
  return data;
};

export const deleteProduct = async ({ userId, productId }) => {
  if (!userId || !productId) {
    throw new Error("Kullanici veya urun bilgisi eksik.");
  }
  const response = await fetch(`${API_BASE_URL}/product/products/${encodeURIComponent(productId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Urun silinemedi.";
    throw new Error(message);
  }
  return data;
};

export const produceProduct = async ({ userId, productId }) => {
  if (!userId || !productId) {
    throw new Error("Kullanici veya urun bilgisi eksik.");
  }

  const response = await fetch(
    `${API_BASE_URL}/product/products/${encodeURIComponent(productId)}/produce`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId })
    }
  );

  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Uretim kaydedilemedi.";
    throw new Error(message);
  }
  return data;
};

export const sellOwnedProduct = async ({ userId, productId, buyerId, received_amount }) => {
  if (!userId || !productId || !buyerId) {
    throw new Error("Kullanici, urun veya musteri bilgisi eksik.");
  }
  const body = {
    user_id: userId,
    buyer_id: buyerId
  };
  if (received_amount !== undefined && received_amount !== null && received_amount !== "") {
    body.received_amount = received_amount;
  }
  const response = await fetch(
    `${API_BASE_URL}/product/owned-products/${encodeURIComponent(productId)}/sell`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Satis islemi basarisiz.";
    throw new Error(message);
  }
  return data;
};
