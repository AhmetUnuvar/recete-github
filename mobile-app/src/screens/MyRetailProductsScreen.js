import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert
} from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";
import PageTitleRow from "../components/PageTitleRow";
import { getRetails, sellRetail } from "../services/productService";
import { getCustomers } from "../services/customerService";
import { getKdvRates } from "../services/calcService";
import KdvPriceInput from "../components/KdvPriceInput";
import { resolvePriceWithKdv } from "../utils/kdv";

const cell = (v) => (v != null && String(v).trim() !== "" ? String(v) : "-");

const formatMoney = (v) => {
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const formatQty = (v) => {
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(3)));
};

export default function MyRetailProductsScreen({
  userId,
  refreshNonce = 0,
  onTransactionsMutated
}) {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellModalStep, setSellModalStep] = useState(1);
  const [sellTarget, setSellTarget] = useState(null);
  const [selectedBuyerId, setSelectedBuyerId] = useState(null);
  const [sellQtyInput, setSellQtyInput] = useState("");
  const [sellUnitPriceInput, setSellUnitPriceInput] = useState("");
  const [sellKdvIncluded, setSellKdvIncluded] = useState(false);
  const [sellKdvRate, setSellKdvRate] = useState(null);
  const [kdvRates, setKdvRates] = useState([]);
  const [receivedAmountInput, setReceivedAmountInput] = useState("");
  const [selling, setSelling] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setCustomers([]);
      setMessage("Giris yapin.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      const [retailRows, customerRows, kdvRows] = await Promise.all([
        getRetails(userId),
        getCustomers(userId),
        getKdvRates().catch(() => [])
      ]);
      setRows(retailRows);
      setCustomers(customerRows);
      setKdvRates(kdvRows);
    } catch (error) {
      setRows([]);
      setMessage(error.message || "Perakende urunler yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load, refreshNonce]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.retail_name,
        r.seller_name,
        r.retail_quantity,
        r.unit_name,
        r.retail_price,
        r.retail_seller_price
      ]
        .filter(Boolean)
        .some((v) => String(v).toLocaleLowerCase("tr-TR").includes(q))
    );
  }, [rows, searchText]);

  const closeSellModal = () => {
    if (selling) return;
    setSellModalOpen(false);
    setSellModalStep(1);
    setSellTarget(null);
    setSelectedBuyerId(null);
    setSellQtyInput("");
    setSellUnitPriceInput("");
    setSellKdvIncluded(false);
    setSellKdvRate(null);
    setReceivedAmountInput("");
  };

  const getResolvedSellUnit = () =>
    resolvePriceWithKdv(sellUnitPriceInput, sellKdvIncluded, sellKdvRate);

  const getSaleTotalPreview = () => {
    if (!sellTarget) return null;
    const unitResolved = getResolvedSellUnit();
    const qty = Number(String(sellQtyInput || "").replace(",", "."));
    if (!unitResolved.ok || Number.isNaN(qty) || qty <= 0) return null;
    return Math.round(unitResolved.final * qty * 10000) / 10000;
  };

  const onSellContinue = () => {
    if (!selectedBuyerId) {
      Alert.alert("Uyari", "Lutfen bir musteri secin.");
      return;
    }
    const qty = Number(String(sellQtyInput || "").replace(",", "."));
    const maxQty = Number(sellTarget?.retail_quantity) || 0;
    if (Number.isNaN(qty) || qty <= 0) {
      Alert.alert("Uyari", "Gecerli bir satis miktari giriniz.");
      return;
    }
    if (qty > maxQty + 1e-9) {
      Alert.alert("Uyari", `En fazla ${formatQty(maxQty)} adet satabilirsiniz.`);
      return;
    }
    const unitResolved = getResolvedSellUnit();
    if (!unitResolved.ok) {
      Alert.alert("Uyari", unitResolved.message || "Birim satis fiyatini kontrol edin.");
      return;
    }
    const total = getSaleTotalPreview();
    if (total === null || total <= 0) {
      Alert.alert("Uyari", "Satis tutari hesaplanamadi.");
      return;
    }
    setReceivedAmountInput(String(total));
    setSellModalStep(2);
  };

  const handleSell = (row) => {
    if (!userId || !row?.id) return;
    const qty = Number(row.retail_quantity);
    if (!(qty > 0)) {
      Alert.alert("Uyari", "Bu urun icin satilabilir miktar kalmadi.");
      return;
    }
    if (customers.length === 0) {
      Alert.alert("Uyari", "Satis icin once Musteriler sayfasindan musteri ekleyin.");
      return;
    }
    const unit = Number(row.retail_price);
    setSellTarget(row);
    setSelectedBuyerId(customers[0]?.id || null);
    setSellQtyInput("");
    setSellUnitPriceInput(Number.isFinite(unit) && unit > 0 ? String(unit) : "");
    setSellKdvIncluded(true);
    setSellKdvRate(null);
    setSellModalStep(1);
    setReceivedAmountInput("");
    setSellModalOpen(true);
  };

  const confirmSell = async () => {
    if (!userId || !sellTarget?.id || !selectedBuyerId) {
      Alert.alert("Uyari", "Lutfen bir musteri secin.");
      return;
    }
    const qty = Number(String(sellQtyInput || "").replace(",", "."));
    const maxQty = Number(sellTarget.retail_quantity) || 0;
    const totalPrev = getSaleTotalPreview();
    if (Number.isNaN(qty) || qty <= 0) {
      Alert.alert("Uyari", "Gecerli bir satis miktari giriniz.");
      return;
    }
    if (qty > maxQty + 1e-9) {
      Alert.alert("Uyari", `En fazla ${formatQty(maxQty)} adet satabilirsiniz.`);
      return;
    }
    const unitResolved = getResolvedSellUnit();
    if (!unitResolved.ok) {
      Alert.alert("Uyari", unitResolved.message || "Birim satis fiyatini kontrol edin.");
      return;
    }
    if (totalPrev === null || totalPrev <= 0) {
      Alert.alert("Uyari", "Satis tutari hesaplanamadi.");
      return;
    }
    const recv = Number(String(receivedAmountInput || "").replace(",", "."));
    if (Number.isNaN(recv) || recv < 0) {
      Alert.alert("Uyari", "Tahsil ettiginiz tutar gecerli bir sayi olmalidir.");
      return;
    }
    if (recv > totalPrev + 1e-6) {
      Alert.alert("Uyari", "Tahsil ettiginiz tutar satis tutarindan buyuk olamaz.");
      return;
    }
    try {
      setSelling(true);
      await sellRetail({
        userId,
        retailId: sellTarget.id,
        buyerId: selectedBuyerId,
        quantitySold: qty,
        unit_sale_price: unitResolved.final,
        received_amount: recv
      });
      closeSellModal();
      await load();
      if (typeof onTransactionsMutated === "function") {
        onTransactionsMutated();
      }
      Alert.alert("Basarili", "Perakende satis kaydedildi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Satis islemi basarisiz.");
    } finally {
      setSelling(false);
    }
  };

  const tableMinWidth = 1420;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        userId ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        ) : undefined
      }
    >
      <PageTitleRow title="Perakende Ürünlerim" titleStyle={styles.title} />

      <TextInput
        style={styles.searchInput}
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Urun adi ile ara"
        placeholderTextColor="#666"
      />

      {!userId ? <Text style={styles.infoText}>{message || "Giris yapin."}</Text> : null}
      {userId && message ? <Text style={styles.infoText}>{message}</Text> : null}
      {userId && loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader} />
      ) : null}

      {userId ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableWrap}>
          <View style={{ minWidth: tableMinWidth }}>
            <View style={styles.headerRow}>
              <Text style={[styles.headerCell, styles.colName]}>Urun Adi</Text>
              <Text style={styles.headerCell}>Tedarikci</Text>
              <Text style={styles.headerCell}>Miktar</Text>
              <Text style={styles.headerCell}>Birim</Text>
              <Text style={styles.headerCell}>Alis Fiyati</Text>
              <Text style={styles.headerCell}>Satis Fiyati</Text>
              <Text style={styles.headerCell}>Tarih</Text>
              <Text style={[styles.headerCell, styles.colAction]}>Islem</Text>
            </View>

            {filteredRows.length === 0 && !loading ? (
              <View style={[styles.emptyRow, { minWidth: tableMinWidth }]}>
                <Text style={styles.emptyText}>Henuz perakende urun kaydi yok.</Text>
              </View>
            ) : (
              filteredRows.map((row) => {
                const dt = new Date(row.created_at);
                const dateTxt = Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("tr-TR");
                const stockQty = Number(row.retail_quantity) || 0;
                const canSell = stockQty > 0;
                return (
                  <View key={row.id} style={styles.dataRow}>
                    <Text style={[styles.dataCell, styles.colName]} numberOfLines={2}>
                      {cell(row.retail_name)}
                    </Text>
                    <Text style={styles.dataCell} numberOfLines={2}>
                      {cell(row.seller_name)}
                    </Text>
                    <Text style={styles.dataCell}>{formatQty(row.retail_quantity)}</Text>
                    <Text style={styles.dataCell}>{cell(row.unit_name)}</Text>
                    <Text style={styles.dataCell}>{formatMoney(row.retail_seller_price)}</Text>
                    <Text style={styles.dataCell}>{formatMoney(row.retail_price)}</Text>
                    <Text style={styles.dataCell}>{dateTxt}</Text>
                    <View style={[styles.dataCell, styles.colAction]}>
                      {canSell ? (
                        <TouchableOpacity
                          style={styles.sellBtn}
                          activeOpacity={0.85}
                          onPress={() => handleSell(row)}
                        >
                          <Text style={styles.sellBtnText}>Satis Yap</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.noStockText}>-</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      ) : null}

      <Modal
        visible={sellModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeSellModal}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => (selling ? null : closeSellModal())} />
          <View style={[styles.modalSheet, sellModalStep === 2 && styles.modalSheetTall]}>
            {sellModalStep === 1 ? (
              <>
                <Text style={styles.modalTitle}>Perakende Satis</Text>
                <Text style={styles.modalSubTitle}>
                  {sellTarget?.retail_name || "Urun"} — Mevcut: {formatQty(sellTarget?.retail_quantity)}{" "}
                  {sellTarget?.unit_name || ""}
                </Text>

                <Text style={styles.fieldLabel}>Hangi musteriye sattiniz?</Text>
                <ScrollView style={styles.modalList}>
                  {customers.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.customerRow, selectedBuyerId === c.id && styles.customerRowActive]}
                      onPress={() => setSelectedBuyerId(c.id)}
                      disabled={selling}
                    >
                      <Text
                        style={[styles.customerName, selectedBuyerId === c.id && styles.customerNameActive]}
                      >
                        {c.customer_name || "-"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.fieldLabel}>Kac adet sattiniz?</Text>
                <TextInput
                  style={styles.qtyInput}
                  value={sellQtyInput}
                  onChangeText={setSellQtyInput}
                  placeholder="Orn: 5"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  editable={!selling}
                />

                <KdvPriceInput
                  label="Birim satis fiyati"
                  placeholder="Birim satis fiyati"
                  value={sellUnitPriceInput}
                  onChangeValue={setSellUnitPriceInput}
                  kdvIncluded={sellKdvIncluded}
                  onKdvIncludedChange={(v) => {
                    setSellKdvIncluded(v);
                    if (v) setSellKdvRate(null);
                  }}
                  selectedKdvRate={sellKdvRate}
                  onSelectedKdvRateChange={setSellKdvRate}
                  kdvRates={kdvRates}
                  inputStyle={styles.qtyInput}
                  disabled={selling}
                />

                {getSaleTotalPreview() !== null ? (
                  <Text style={styles.previewText}>
                    Tahmini satis tutari: {formatMoney(getSaleTotalPreview())}
                  </Text>
                ) : null}

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={closeSellModal} disabled={selling}>
                    <Text style={styles.cancelBtnText}>Vazgec</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={onSellContinue} disabled={selling}>
                    <Text style={styles.confirmBtnText}>Devam</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Tahsilat</Text>
                <Text style={styles.modalSubTitle}>
                  {sellTarget?.retail_name || "Urun"} — Satis tutari (tahsil etmeniz gereken):{" "}
                  {getSaleTotalPreview() !== null ? formatMoney(getSaleTotalPreview()) : "-"}
                </Text>
                <Text style={styles.paymentQuestion}>
                  Alacaklarin hepsini aldiniz mi? Simdilik ne kadar tahsil ettiniz? Tahsil ettiginiz tutar islem
                  kaydiniza yazilir; kalan tutar Borclar Alacaklar sayfasinda musteri alacagi olarak gorunur.
                </Text>
                <TextInput
                  style={styles.qtyInput}
                  value={receivedAmountInput}
                  onChangeText={setReceivedAmountInput}
                  placeholder="Tahsil edilen tutar"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  editable={!selling}
                />
                {(() => {
                  const totalP = getSaleTotalPreview();
                  const recvN = Number(String(receivedAmountInput || "").replace(",", "."));
                  if (
                    totalP === null ||
                    Number.isNaN(recvN) ||
                    recvN < 0 ||
                    recvN >= totalP - 1e-6
                  ) {
                    return null;
                  }
                  const rem = Math.round((totalP - recvN) * 10000) / 10000;
                  return (
                    <Text style={styles.remainderHint}>
                      Kalan {rem.toLocaleString("tr-TR")} musteri alacagi olarak kaydedilir.
                    </Text>
                  );
                })()}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      if (selling) return;
                      setSellModalStep(1);
                    }}
                    disabled={selling}
                  >
                    <Text style={styles.cancelBtnText}>Geri</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={confirmSell} disabled={selling}>
                    <Text style={styles.confirmBtnText}>{selling ? "Kaydediliyor..." : "Satis Yap"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  content: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 24
  },
  title: {
    color: COLORS.primary,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 0
  },
  searchInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 14
  },
  infoText: {
    color: COLORS.textLight,
    fontSize: 13,
    marginBottom: 8
  },
  loader: {
    marginBottom: 8
  },
  tableWrap: {
    paddingBottom: 8
  },
  headerRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8
  },
  dataRow: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center"
  },
  headerCell: {
    width: 130,
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 3
  },
  dataCell: {
    width: 130,
    color: COLORS.textLight,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 3
  },
  colName: {
    width: 180,
    textAlign: "left"
  },
  colAction: {
    width: 110,
    alignItems: "center",
    justifyContent: "center"
  },
  sellBtn: {
    backgroundColor: "#28a745",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8
  },
  sellBtnText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800"
  },
  noStockText: {
    color: COLORS.textLight,
    fontSize: 11
  },
  emptyRow: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLORS.border,
    paddingVertical: 20,
    alignItems: "center"
  },
  emptyText: {
    color: COLORS.textLight,
    fontSize: 12
  },
  modalRoot: {
    flex: 1,
    justifyContent: "center"
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  modalSheet: {
    marginHorizontal: HORIZONTAL_PADDING,
    maxHeight: "80%",
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12
  },
  modalSheetTall: {
    maxHeight: "85%"
  },
  modalTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: "800"
  },
  modalSubTitle: {
    color: COLORS.textLight,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 10
  },
  fieldLabel: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6
  },
  modalList: {
    maxHeight: 200,
    marginBottom: 12
  },
  customerRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: COLORS.black
  },
  customerRowActive: {
    borderColor: COLORS.primary
  },
  customerName: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600"
  },
  customerNameActive: {
    color: COLORS.primary,
    fontWeight: "800"
  },
  qtyInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    fontSize: 15,
    marginBottom: 8
  },
  previewText: {
    color: COLORS.textLight,
    fontSize: 12,
    marginBottom: 10
  },
  paymentQuestion: {
    color: COLORS.textLight,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10
  },
  remainderHint: {
    color: "#a8936a",
    fontSize: 12,
    marginBottom: 10
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  cancelBtnText: {
    color: COLORS.textLight,
    fontWeight: "700"
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary
  },
  confirmBtnText: {
    color: COLORS.black,
    fontWeight: "800"
  }
});
