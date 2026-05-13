import { API_BASE_URL } from "../constants/config";

const parseBody = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_e) {
    return { message: text };
  }
};

/** materials: mobil addedMaterials uyumlu alanlar { stockId, stockUnitName, unitCost, amount, unit } */
export const previewRecipeCost = async (materialLines) => {
  const lines = materialLines.map((m) => ({
    stock_id: m.stockId,
    unit_cost: m.unitCost,
    stock_unit: m.stockUnitName,
    quantity: Number(String(m.amount).replace(",", ".")),
    quantity_unit: m.unit
  }));

  const response = await fetch(`${API_BASE_URL}/calc/recipe-cost`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines })
  });
  const data = await parseBody(response);
  if (!response.ok) {
    throw new Error(data.message || "Maliyet onizlemesi yapilamadi.");
  }
  return data;
};
