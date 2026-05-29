import { API_BASE_URL } from "../constants/config";

let authToken = null;

export const setAuthToken = (token) => {
  authToken = token ? String(token) : null;
};

export const getAuthToken = () => authToken;

export const apiFetch = async (path, options = {}) => {
  const method = options.method || "GET";
  const headers = { ...(options.headers || {}) };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let body = options.body;
  if (body !== undefined && body !== null && typeof body !== "string") {
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    body = JSON.stringify(body);
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    method,
    headers,
    body: body ?? undefined
  });
};

export const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};
