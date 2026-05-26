import React, { useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { COLORS } from "../constants/colors";
import { formatKdvRateLabel, resolvePriceWithKdv } from "../utils/kdv";
import { getKdvRates } from "../services/calcService";

/**
 * Fiyat girisi + "KDV dahil" secenegi + oran secimi.
 * kdvRates verilmezse API'den yukler.
 */
export default function KdvPriceInput({
  label,
  placeholder = "Tutar girin",
  value,
  onChangeValue,
  kdvIncluded,
  onKdvIncludedChange,
  selectedKdvRate,
  onSelectedKdvRateChange,
  kdvRates: kdvRatesProp,
  inputStyle,
  disabled = false
}) {
  const [kdvRates, setKdvRates] = React.useState(kdvRatesProp || []);
  const [loadingRates, setLoadingRates] = React.useState(!kdvRatesProp?.length);

  useEffect(() => {
    if (kdvRatesProp?.length) {
      setKdvRates(kdvRatesProp);
      setLoadingRates(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingRates(true);
        const rows = await getKdvRates();
        if (!cancelled) setKdvRates(rows);
      } catch {
        if (!cancelled) setKdvRates([]);
      } finally {
        if (!cancelled) setLoadingRates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kdvRatesProp]);

  const resolved = useMemo(
    () => resolvePriceWithKdv(value, kdvIncluded, selectedKdvRate),
    [value, kdvIncluded, selectedKdvRate]
  );

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, inputStyle]}
        value={value}
        onChangeText={onChangeValue}
        placeholder={placeholder}
        placeholderTextColor="#666"
        keyboardType="decimal-pad"
        editable={!disabled}
      />

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => onKdvIncludedChange(!kdvIncluded)}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <View style={[styles.checkbox, kdvIncluded && styles.checkboxChecked]}>
          {kdvIncluded ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <Text style={styles.checkboxLabel}>KDV dahil</Text>
      </TouchableOpacity>

      {!kdvIncluded ? (
        <View style={styles.rateBlock}>
          <Text style={styles.rateHint}>KDV orani secin (tutara eklenecek)</Text>
          {loadingRates ? (
            <ActivityIndicator color={COLORS.primary} style={styles.rateLoader} />
          ) : kdvRates.length === 0 ? (
            <Text style={styles.rateEmpty}>KDV oranlari yuklenemedi.</Text>
          ) : (
            <View style={styles.rateRow}>
              {kdvRates.map((row) => {
                const rate = row.kdv_rate;
                const selected = Number(selectedKdvRate) === Number(rate);
                return (
                  <TouchableOpacity
                    key={row.id || String(rate)}
                    style={[styles.ratePill, selected && styles.ratePillSelected]}
                    onPress={() => onSelectedKdvRateChange(rate)}
                    disabled={disabled}
                  >
                    <Text style={[styles.ratePillText, selected && styles.ratePillTextSelected]}>
                      {formatKdvRateLabel(rate)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      {resolved.ok && !kdvIncluded && resolved.rate !== null ? (
        <Text style={styles.preview}>
          KDV dahil tutar: {resolved.final.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          {" "}
          ({formatKdvRateLabel(resolved.rate)} eklendi)
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  label: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 4
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.textLight,
    backgroundColor: COLORS.card,
    marginBottom: 10
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card
  },
  checkboxChecked: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary
  },
  checkMark: {
    color: COLORS.black,
    fontSize: 14,
    fontWeight: "800"
  },
  checkboxLabel: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600"
  },
  rateBlock: { marginBottom: 8 },
  rateHint: {
    color: "#9a9a9a",
    fontSize: 12,
    marginBottom: 8
  },
  rateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  ratePill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    backgroundColor: COLORS.card
  },
  ratePillSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary
  },
  ratePillText: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600"
  },
  ratePillTextSelected: {
    color: COLORS.black
  },
  rateLoader: { marginVertical: 8 },
  rateEmpty: { color: "#c55", fontSize: 13 },
  preview: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8
  }
});
