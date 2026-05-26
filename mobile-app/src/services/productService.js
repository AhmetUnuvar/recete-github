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

export const getRetails = async (userId) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }

  const response = await fetch(
    `${API_BASE_URL}/product/retails?user_id=${encodeURIComponent(userId)}`
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Perakende urunler getirilemedi.";
    throw new Error(message);
  }
  return Array.isArray(data) ? data : [];
};

export const createRetail = async ({
  userId,
  sellerId,
  retailName,
  retailQuantity,
  unitId,
  retailSellerPrice,
  retailPrice,
  paidAmount
}) => {
  if (!userId) {
    throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
  }

  const response = await fetch(`${API_BASE_URL}/product/retails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      seller_id: sellerId,
      retail_name: retailName,
      retail_quantity: retailQuantity,
      unit_id: unitId,
      retail_seller_price: retailSellerPrice,
      retail_price: retailPrice,
      ...(paidAmount !== undefined && paidAmount !== null && paidAmount !== ""
        ? { paid_amount: paidAmount }
        : {})
    })
  });
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Perakende urun kaydedilemedi.";
    throw new Error(message);
  }
  return data;
};

export const sellRetail = async ({
  userId,
  retailId,
  buyerId,
  quantitySold,
  received_amount,
  unit_sale_price
}) => {
  if (!userId || !retailId || !buyerId) {
    throw new Error("Kullanici, urun veya musteri bilgisi eksik.");
  }
  const qty = Number(quantitySold);
  if (Number.isNaN(qty) || qty <= 0) {
    throw new Error("Gecerli bir satis miktari giriniz.");
  }
  const response = await fetch(
    `${API_BASE_URL}/product/retails/${encodeURIComponent(retailId)}/sell`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        buyer_id: buyerId,
        quantity_sold: qty,
        ...(received_amount !== undefined && received_amount !== null && received_amount !== ""
          ? { received_amount }
          : {}),
        ...(unit_sale_price !== undefined && unit_sale_price !== null && unit_sale_price !== ""
          ? { unit_sale_price }
          : {})
      })
    }
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Perakende satis islemi basarisiz.";
    throw new Error(message);
  }
  return data;
};

export const setProductAlert = async ({ userId, productId, productAlert }) => {
  if (!userId || !productId) {
    throw new Error("Kullanici veya urun bilgisi eksik.");
  }
  const response = await fetch(
    `${API_BASE_URL}/product/products/${encodeURIComponent(productId)}/alert`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        product_alert: productAlert
      })
    }
  );
  const data = await parseResponseBody(response);
  if (!response.ok) {
    const message =
      typeof data?.message === "string" && data.message.includes("<!DOCTYPE")
        ? "Sunucu JSON yerine HTML dondu. API rotasi kontrol edilmeli."
        : data.message || "Urun uyarisi kaydedilemedi.";
    throw new Error(message);
  }
  return data;
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

export const sellOwnedProduct = async ({ userId, productId, buyerId, received_amount, sale_price }) => {
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
  if (sale_price !== undefined && sale_price !== null && sale_price !== "") {
    body.sale_price = sale_price;
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
