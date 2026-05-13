import { API_BASE_URL } from "../constants/config";

const jsonRequest = async (path, payload, method = "POST") => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Istek zaman asimina ugradi. Lutfen tekrar dene.");
    }
    throw new Error(
      `Sunucuya ulasilamadi. API adresini kontrol et: ${API_BASE_URL}`
    );
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    data = { message: raw };
  }

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

/** Kayitli hesap varsa sifre sifirlama kodu e-postaya gider (auth -> mail). */
export const sendForgotPasswordCode = async (payload) => {
  return jsonRequest("/auth/forgot-password/send-code", payload);
};

/** E-postadaki 6 haneli kod dogruysa sifre degisikligi icin reset_token doner. */
export const verifyPasswordResetCode = async (payload) => {
  return jsonRequest("/mail/password-reset/verify-code", payload);
};

/** Profilde: mevcut sifre + yeni sifre (mail yok). */
export const changePassword = async (payload) => {
  return jsonRequest("/auth/change-password", payload);
};
