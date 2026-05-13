const normalizeRaw = (s) => {
  if (s === undefined || s === null) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
};

const LENGTH = "length";
const MASS = "mass";
const VOLUME = "volume";
const COUNT = "count";

const aliasToCanon = {};

const reg = (canonFamily, canonKey, toMetreOrKgOrLOrPieces, aliases) => {
  for (const a of aliases) {
    aliasToCanon[normalizeRaw(a)] = { family: canonFamily, canonKey, factor: toMetreOrKgOrLOrPieces };
  }
};

/** factor = multiply quantity to convert TO base metre (length), kg (mass), litre (volume), pieces (count) */
reg(LENGTH, "m", 1, ["metre", "meter", "m"]);
reg(LENGTH, "m", 0.01, ["cm", "santimetre", "sentimetre", "centimeter", "centimetre"]);
reg(LENGTH, "m", 0.001, ["mm", "milimetre", "millimeter", "millimetre"]);
reg(LENGTH, "m", 1000, ["km", "kilometre", "kilometer", "kilometre"]);

reg(MASS, "kg", 1, ["kg", "kilogram", "kilo"]);
reg(MASS, "kg", 0.001, ["g", "gr", "gram", "gramme"]);
reg(MASS, "kg", 1e-6, ["mg", "miligram", "milligram"]);

reg(VOLUME, "l", 1, ["l", "lt", "litre", "liter"]);
reg(VOLUME, "l", 0.001, ["ml", "mililitre", "milliliter", "millilitre"]);

reg(COUNT, "adet", 1, ["adet", "pcs", "pc", "piece", "pieces", "tane", "birim"]);

/** Once tam metin ("metre"); olmuyorsa son kelime ("kablo metre" -> metre) */
const resolveAlias = (name) => {
  if (name === undefined || name === null || String(name).trim() === "") {
    return null;
  }
  const full = normalizeRaw(name);
  if (aliasToCanon[full]) {
    return aliasToCanon[full];
  }
  const parts = String(name)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .split(" ");
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const k = normalizeRaw(parts[i]);
    if (k && aliasToCanon[k]) {
      return aliasToCanon[k];
    }
  }
  return null;
};

const toBaseQty = (quantity, normalizedEntry) => {
  if (!normalizedEntry) return null;
  return quantity * normalizedEntry.factor;
};

const baseToUnitQty = (baseQty, targetEntry) => {
  if (!targetEntry || targetEntry.factor === 0) return null;
  return baseQty / targetEntry.factor;
};

const resolveUnitPair = (a, b) => {
  const ua = typeof a === "string" ? resolveAlias(a) : null;
  const ub = typeof b === "string" ? resolveAlias(b) : null;
  return { ua, ub };
};

const convertQuantityBetweenUnits = (quantity, fromName, toName) => {
  const { ua, ub } = resolveUnitPair(fromName, toName);
  if (!ua || !ub) return { ok: false, error: "bilinmeyen_birim" };
  if (ua.family !== ub.family) {
    return {
      ok: false,
      error: `uyumsuz_aile (${ua.family} vs ${ub.family})`
    };
  }
  const base = toBaseQty(quantity, ua);
  const inTarget = baseToUnitQty(base, ub);
  if (inTarget === null || Number.isNaN(inTarget)) {
    return { ok: false, error: "donusum_basarisiz" };
  }
  return { ok: true, qty: inTarget, family: ua.family };
};

module.exports = {
  normalizeRaw,
  convertQuantityBetweenUnits,
  LENGTH,
  MASS,
  VOLUME,
  COUNT,
  resolveAlias
};
