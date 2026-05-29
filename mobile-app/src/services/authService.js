import { API_BASE_URL } from "../constants/config";
import { apiFetch, parseJsonResponse } from "./apiClient";

const jsonRequest = async (path, payload, method = "POST") => {
  let response;
  try {
    response = await apiFetch(path, {
      method,
      body: method === "GET" ? undefined : payload
    });
  } catch (_error) {
    throw new Error(`Sunucuya ulasilamadi. API adresini kontrol et: ${API_BASE_URL}`);
  }

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.message || "Islem sirasinda hata olustu.");
  }
  return data;
};

/** Kayit e-postasina 6 haneli dogrulama kodu gonderir (mail-service). */
export const sendRegistrationCode = async (payload) => {
  return jsonRequest("/mail/registration/send-code", payload);
};

/** Kod dogruysa auth kaydinda kullanilacak kisa omurlu kanit (JWT) doner. */
export const verifyRegistrationCode = async (payload) => {
  return jsonRequest("/mail/registration/verify-code", payload);
};

export const registerUser = async (payload) => {
  return jsonRequest("/auth/register", payload);
};

export const loginUser = async (payload) => {
  return jsonRequest("/auth/login", payload);
};

export const getMe = async () => {
  return jsonRequest("/auth/me", null, "GET");
};

/** Hesap sahibi: referans kodu ile ortak kullanici ekler (eklenen kisi sahibin verilerine erisir). */
export const addSharedMemberByReferenceCode = async (referenceCode) => {
  return jsonRequest("/auth/shared-users", { reference_code: referenceCode });
};

export const getSharedMembers = async () => {
  return jsonRequest("/auth/shared-members", null, "GET");
};

/** Calisanin erisebildigi isveren hesaplari. */
export const getSharedAccounts = async () => {
  return jsonRequest("/auth/shared-accounts", null, "GET");
};

/**
 * Uygulamada kullanilacak is verisi sahibi (user_id).
 * Calisan ise isverenin id'si; isletme sahibi ise kendi id'si.
 */
export const resolveWorkspaceUserId = async (loggedInUserId) => {
  const selfId = String(loggedInUserId || "");
  if (!selfId) return selfId;
  try {
    const shared = await getSharedAccounts();
    const rows = Array.isArray(shared) ? shared : [];
    const ownerId = rows[0]?.owner_user_id;
    if (ownerId) return String(ownerId);
  } catch {
    /* giris yapan kendi hesabi */
  }
  return selfId;
};

export const removeSharedMember = async (accessId) => {
  return jsonRequest(`/auth/shared-users/${encodeURIComponent(accessId)}`, null, "DELETE");
};

/** Kayitli hesap varsa sifre sifirlama kodu e-postaya gider (auth -> mail). */
export const sendForgotPasswordCode = async (payload) => {
  return jsonRequest("/auth/forgot-password/send-code", payload);
};

/** E-postadaki 6 haneli kod dogruysa sifre degisikligi icin reset_token doner. */
export const verifyPasswordResetCode = async (payload) => {
  return jsonRequest("/mail/password-reset/verify-code", payload);
};

export const completePasswordReset = async (payload) => {
  return jsonRequest("/auth/forgot-password/complete", payload);
};

/** Profilde: mevcut sifre + yeni sifre (mail yok). */
export const changePassword = async (payload) => {
  return jsonRequest("/auth/change-password", payload);
};
