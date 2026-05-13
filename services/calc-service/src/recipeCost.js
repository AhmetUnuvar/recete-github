const { convertQuantityBetweenUnits } = require("./units");

const round4 = (n) => Math.round(Number(n) * 10000) / 10000;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Birim maliyet: stok kaydinin ana birimi (stock_unit) basina.
 * quantity: kullanici girisi; quantity_unit ile ifade edilir (yoksa stok birimi varsayilir).
 */
const computeLineCost = ({ unit_cost, stock_unit, quantity, quantity_unit }) => {
  const uc = Number(unit_cost);
  const qty = Number(quantity);

  if (Number.isNaN(uc) || uc < 0) {
    return { ok: false, error: "gecersiz_birim_maliyet" };
  }
  if (Number.isNaN(qty) || qty <= 0) {
    return { ok: false, error: "gecersiz_miktar" };
  }

  const su = String(stock_unit || "").trim();
  if (!su) {
    return { ok: false, error: "stok_birimi_bos" };
  }

  const quEff = (quantity_unit && String(quantity_unit).trim()) || su;

  const conv = convertQuantityBetweenUnits(qty, quEff, su);
  if (!conv.ok) {
    return {
      ok: false,
      error: conv.error || `birim donusumu basarisiz: '${quEff}' -> '${su}'`
    };
  }

  const qtyInStockUnits = conv.qty;
  const lineCostRaw = qtyInStockUnits * uc;

  return {
    ok: true,
    qty_in_stock_units: round4(qtyInStockUnits),
    line_cost: round2(lineCostRaw)
  };
};

const computeRecipeCost = (linesInput) => {
  if (!Array.isArray(linesInput) || linesInput.length === 0) {
    return { ok: false, error: "lines bos olamaz.", lines: [], total_cost: 0 };
  }

  const outLines = [];
  let total = 0;

  for (let i = 0; i < linesInput.length; i += 1) {
    const line = linesInput[i];
    const r = computeLineCost({
      unit_cost: line.unit_cost,
      stock_unit: line.stock_unit,
      quantity: line.quantity,
      quantity_unit: line.quantity_unit
    });

    if (!r.ok) {
      return {
        ok: false,
        error: r.error,
        line_index: i,
        lines: outLines,
        total_cost: 0
      };
    }

    total += r.line_cost;
    outLines.push({
      stock_id: line.stock_id,
      quantity: Number(line.quantity),
      quantity_unit: line.quantity_unit || line.stock_unit,
      stock_unit: line.stock_unit,
      unit_cost: Number(line.unit_cost),
      qty_in_stock_units: r.qty_in_stock_units,
      line_cost: r.line_cost
    });
  }

  return {
    ok: true,
    lines: outLines,
    total_cost: round2(total)
  };
};

module.exports = {
  computeLineCost,
  computeRecipeCost
};
