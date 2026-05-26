export const roundMoney = (n) => Math.round(Number(n) * 10000) / 10000;

export const parseMoneyInput = (value) => {
  const n = Number(String(value ?? "").replace(",", ".").trim());
  if (Number.isNaN(n) || n < 0) return null;
  return n;
};

/**
 * Girilen tutar KDV dahil degilse secilen oran eklenir.
 * @returns {{ ok: true, final: number, base: number, rate: number|null } | { ok: false, message: string }}
 */
export const resolvePriceWithKdv = (baseInput, kdvIncluded, selectedKdvRate) => {
  const base = parseMoneyInput(baseInput);
  if (base === null) {
    return { ok: false, message: "Gecerli bir tutar giriniz." };
  }
  if (kdvIncluded) {
    return { ok: true, final: roundMoney(base), base, rate: null };
  }
  if (selectedKdvRate === null || selectedKdvRate === undefined || selectedKdvRate === "") {
    return { ok: false, message: "KDV orani seciniz veya KDV dahil kutusunu isaretleyin." };
  }
  const rate = Number(selectedKdvRate);
  if (Number.isNaN(rate) || rate < 0) {
    return { ok: false, message: "Gecerli bir KDV orani seciniz." };
  }
  return {
    ok: true,
    final: roundMoney(base * (1 + rate / 100)),
    base,
    rate
  };
};

export const formatKdvRateLabel = (rate) => {
  const n = Number(rate);
  if (Number.isNaN(n)) return "-";
  if (Number.isInteger(n)) return `%${n}`;
  return `%${n.toFixed(2).replace(/\.?0+$/, "")}`;
};
