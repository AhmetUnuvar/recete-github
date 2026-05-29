import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { API_BASE_URL } from "../constants/config";

const parseJson = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { message: text };
  }
};

export const exportAndShareTable = async ({ title, columns, rows, format, extras }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await apiFetch(`/table-maker/table/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, columns, rows, format, extras: extras ?? [] }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Tablo servisi yanit vermedi (zaman asimi).");
    }
    throw new Error("Tablo servisine ulasilamadi.");
  } finally {
    clearTimeout(timer);
  }
  const data = await parseJson(response);
  if (!response.ok) {
    throw new Error(data.message || "Tablo disa aktarilamadi.");
  }

  const fileName = data.file_name || `tablo.${format === "png" ? "png" : "csv"}`;
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  const base64Encoding = FileSystem?.EncodingType?.Base64 || "base64";
  await FileSystem.writeAsStringAsync(fileUri, data.base64 || "", {
    encoding: base64Encoding
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Bu cihazda paylasma ozelligi kullanilamiyor.");
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: data.mime_type || (format === "png" ? "image/png" : "text/csv"),
    dialogTitle: "Tabloyu disa aktar"
  });
};
