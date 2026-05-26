import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert
} from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";
import PageTitleRow from "../components/PageTitleRow";
import { createRetail } from "../services/productService";
import { getSellers, getUnits } from "../services/stockService";
import { getKdvRates } from "../services/calcService";
import KdvPriceInput from "../components/KdvPriceInput";
import { resolvePriceWithKdv } from "../utils/kdv";

export default function RetailBuyScreen({ userId, onSaved }) {
  const [sellers, setSellers] = useState([]);
  const [units, setUnits] = useState([]);
  const [seller, setSeller] = useState(null);
  const [unit, setUnit] = useState(null);
  const [retailName, setRetailName] = useState("");
  const [retailQuantity, setRetailQuantity] = useState("");
  const [retailSellerPrice, setRetailSellerPrice] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [buyKdvIncluded, setBuyKdvIncluded] = useState(false);
  const [buyKdvRate, setBuyKdvRate] = useState(null);
  const [sellKdvIncluded, setSellKdvIncluded] = useState(false);
  const [sellKdvRate, setSellKdvRate] = useState(null);
  const [kdvRates, setKdvRates] = useState([]);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [openPicker, setOpenPicker] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmStep, setConfirmStep] = useState(1);
  const [paidAmountInput, setPaidAmountInput] = useState("");

  const closePicker = () => setOpenPicker(null);

  const loadLookups = useCallback(async () => {
    if (!userId) return;
    try {
      setSellersLoading(true);
      setUnitsLoading(true);
      const [sellerRows, unitRows, kdvRows] = await Promise.all([
        getSellers(userId),
        getUnits(userId),
        getKdvRates().catch(() => [])
      ]);
      setSellers(sellerRows);
      setUnits(unitRows);
      setKdvRates(kdvRows);
    } catch (error) {
      setMessage(error.message || "Liste yuklenemedi.");
    } finally {
      setSellersLoading(false);
      setUnitsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  const renderPickerModal = (key, data, onSelect, title, loading) => (
    <Modal visible={openPicker === key} transparent animationType="fade" onRequestClose={closePicker}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={closePicker} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{title}</Text>
          <FlatList
            data={data}
            keyExtractor={(item) => String(item.id)}
            ListEmptyComponent={
              <Text style={styles.modalEmpty}>{loading ? "Yukleniyor..." : "Kayit yok."}</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalRow}
                onPress={() => {
                  onSelect(item);
                  closePicker();
                }}
              >
                <Text style={styles.modalRowText}>
                  {key === "seller" ? item.seller_name : item.unit_name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );

  const resetForm = () => {
    setSeller(null);
    setUnit(null);
    setRetailName("");
    setRetailQuantity("");
    setRetailSellerPrice("");
    setRetailPrice("");
    setBuyKdvIncluded(false);
    setBuyKdvRate(null);
    setSellKdvIncluded(false);
    setSellKdvRate(null);
  };

  const getResolvedBuyUnit = () =>
    resolvePriceWithKdv(retailSellerPrice, buyKdvIncluded, buyKdvRate);

  const getResolvedSellUnit = () =>
    resolvePriceWithKdv(retailPrice, sellKdvIncluded, sellKdvRate);

  const getPurchaseTotalPreview = () => {
    const qty = Number(String(retailQuantity || "").replace(",", "."));
    const buyResolved = getResolvedBuyUnit();
    if (Number.isNaN(qty) || qty <= 0 || !buyResolved.ok) return null;
    const buy = buyResolved.final;
    return Math.round(qty * buy * 10000) / 10000;
  };

  const closeConfirmModal = () => {
    if (saving) return;
    setShowConfirmModal(false);
    setConfirmStep(1);
    setPaidAmountInput("");
  };

  const onOpenConfirm = () => {
    if (!userId) {
      Alert.alert("Uyari", "Giris yapmaniz gerekiyor.");
      return;
    }
    if (!seller?.id) {
      Alert.alert("Uyari", "Tedarikci seciniz.");
      return;
    }
    if (!String(retailName || "").trim()) {
      Alert.alert("Uyari", "Perakende urun adi giriniz.");
      return;
    }
    if (!unit?.id) {
      Alert.alert("Uyari", "Birim seciniz.");
      return;
    }
    const qty = Number(String(retailQuantity || "").replace(",", "."));
    const buyResolved = getResolvedBuyUnit();
    const sellResolved = getResolvedSellUnit();
    if (Number.isNaN(qty) || qty <= 0) {
      Alert.alert("Uyari", "Gecerli bir miktar giriniz.");
      return;
    }
    if (!buyResolved.ok) {
      Alert.alert("Uyari", buyResolved.message || "Alis fiyatini kontrol edin.");
      return;
    }
    if (!sellResolved.ok) {
      Alert.alert("Uyari", sellResolved.message || "Satis fiyatini kontrol edin.");
      return;
    }
    const total = getPurchaseTotalPreview();
    if (total === null || total <= 0) {
      Alert.alert("Uyari", "Toplam alis tutari hesaplanamadi.");
      return;
    }
    setConfirmStep(1);
    setPaidAmountInput("");
    setShowConfirmModal(true);
  };

  const onConfirmContinue = () => {
    const total = getPurchaseTotalPreview();
    if (total === null || total <= 0) {
      Alert.alert("Uyari", "Toplam alis tutari hesaplanamadi.");
      return;
    }
    setPaidAmountInput(String(total));
    setConfirmStep(2);
  };

  const onSaveRetail = async () => {
    const qty = Number(String(retailQuantity || "").replace(",", "."));
    const buyResolved = getResolvedBuyUnit();
    const sellResolved = getResolvedSellUnit();
    if (!buyResolved.ok) {
      Alert.alert("Uyari", buyResolved.message || "Alis fiyatini kontrol edin.");
      return;
    }
    if (!sellResolved.ok) {
      Alert.alert("Uyari", sellResolved.message || "Satis fiyatini kontrol edin.");
      return;
    }
    const buy = buyResolved.final;
    const sell = sellResolved.final;
    const totalPrev = getPurchaseTotalPreview();
    if (totalPrev === null) {
      Alert.alert("Uyari", "Toplam alis tutari hesaplanamadi.");
      return;
    }
    const paid = Number(String(paidAmountInput || "").replace(",", "."));
    if (Number.isNaN(paid) || paid < 0) {
      Alert.alert("Uyari", "Odediginiz tutar gecerli bir sayi olmalidir.");
      return;
    }
    if (paid > totalPrev + 1e-6) {
      Alert.alert("Uyari", "Odenen tutar toplam alis tutarindan buyuk olamaz.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");
      await createRetail({
        userId,
        sellerId: seller.id,
        retailName: retailName.trim(),
        retailQuantity: qty,
        unitId: unit.id,
        retailSellerPrice: buy,
        retailPrice: sell,
        paidAmount: paid
      });
      resetForm();
      closeConfirmModal();
      if (typeof onSaved === "function") {
        onSaved();
      }
      Alert.alert("Basarili", "Perakende urun kaydedildi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Kayit basarisiz.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <PageTitleRow title="Perakende Ürün Al" titleStyle={styles.title} />

        {!userId ? <Text style={styles.message}>Giris yapmaniz gerekiyor.</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Text style={styles.label}>Urunun alindigi tedarikci</Text>
        <TouchableOpacity
          style={styles.selectBox}
          onPress={() => setOpenPicker("seller")}
          disabled={!userId || sellersLoading}
        >
          <Text style={seller ? styles.selectValue : styles.selectPlaceholder}>
            {sellersLoading ? "Yukleniyor..." : seller?.seller_name || "Tedarikci seciniz"}
          </Text>
          <Text style={styles.chevron}>v</Text>
        </TouchableOpacity>
        {renderPickerModal("seller", sellers, setSeller, "Tedarikci sec", sellersLoading)}

        <Text style={styles.label}>Perakende urun adi</Text>
        <TextInput
          style={styles.input}
          value={retailName}
          onChangeText={setRetailName}
          placeholder="Urun adi"
          placeholderTextColor="#666"
        />

        <Text style={styles.label}>Perakende urun miktari</Text>
        <TextInput
          style={styles.input}
          value={retailQuantity}
          onChangeText={setRetailQuantity}
          placeholder="Miktar"
          placeholderTextColor="#666"
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Perakende urun birimi</Text>
        <TouchableOpacity
          style={styles.selectBox}
          onPress={() => setOpenPicker("unit")}
          disabled={!userId || unitsLoading}
        >
          <Text style={unit ? styles.selectValue : styles.selectPlaceholder}>
            {unitsLoading ? "Yukleniyor..." : unit?.unit_name || "Birim seciniz"}
          </Text>
          <Text style={styles.chevron}>v</Text>
        </TouchableOpacity>
        {renderPickerModal("unit", units, setUnit, "Birim sec", unitsLoading)}

        <KdvPriceInput
          label="Perakende urun birim alis fiyati"
          placeholder="Birim alis fiyati"
          value={retailSellerPrice}
          onChangeValue={setRetailSellerPrice}
          kdvIncluded={buyKdvIncluded}
          onKdvIncludedChange={(v) => {
            setBuyKdvIncluded(v);
            if (v) setBuyKdvRate(null);
          }}
          selectedKdvRate={buyKdvRate}
          onSelectedKdvRateChange={setBuyKdvRate}
          kdvRates={kdvRates}
          inputStyle={styles.input}
        />

        <KdvPriceInput
          label="Perakende urun birim satis fiyati"
          placeholder="Birim satis fiyati"
          value={retailPrice}
          onChangeValue={setRetailPrice}
          kdvIncluded={sellKdvIncluded}
          onKdvIncludedChange={(v) => {
            setSellKdvIncluded(v);
            if (v) setSellKdvRate(null);
          }}
          selectedKdvRate={sellKdvRate}
          onSelectedKdvRateChange={setSellKdvRate}
          kdvRates={kdvRates}
          inputStyle={styles.input}
        />

        <TouchableOpacity style={styles.button} onPress={onOpenConfirm} disabled={saving || !userId}>
          {saving ? (
            <ActivityIndicator color={COLORS.black} />
          ) : (
            <Text style={styles.buttonText}>Kaydet</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={closeConfirmModal}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeConfirmModal} />
          <View style={styles.confirmSheet}>
            {confirmStep === 1 ? (
              <>
                <Text style={styles.modalTitle}>Alis onayi</Text>
                <Text style={styles.confirmRow}>Urun: {retailName.trim() || "-"}</Text>
                <Text style={styles.confirmRow}>Tedarikci: {seller?.seller_name || "-"}</Text>
                <Text style={styles.confirmRow}>Miktar: {retailQuantity || "-"}</Text>
                {(() => {
                  const tp = getPurchaseTotalPreview();
                  return tp !== null ? (
                    <Text style={styles.confirmHighlight}>
                      Toplam alis tutari: {tp.toLocaleString("tr-TR")}
                    </Text>
                  ) : null;
                })()}
                <View style={styles.confirmActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={closeConfirmModal} disabled={saving}>
                    <Text style={styles.cancelBtnText}>Iptal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={onConfirmContinue} disabled={saving}>
                    <Text style={styles.confirmBtnText}>Devam</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Odeme bilgisi</Text>
                <Text style={styles.confirmRow}>
                  Toplam alis tutari:{" "}
                  {getPurchaseTotalPreview() !== null
                    ? getPurchaseTotalPreview().toLocaleString("tr-TR")
                    : "-"}
                </Text>
                <Text style={styles.paymentQuestion}>
                  Tutarin tamamini odediniz mi? Odediginiz kisim gider olarak kaydedilir; kalan tutar{" "}
                  {seller?.seller_name || "tedarikci"} icin borc olarak Borclar Alacaklar sayfasinda gorunur.
                </Text>
                <TextInput
                  style={styles.input}
                  value={paidAmountInput}
                  onChangeText={setPaidAmountInput}
                  placeholder="Odenen tutar"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  editable={!saving}
                />
                {(() => {
                  const totalP = getPurchaseTotalPreview();
                  const paidN = Number(String(paidAmountInput || "").replace(",", "."));
                  if (
                    totalP === null ||
                    Number.isNaN(paidN) ||
                    paidN < 0 ||
                    paidN >= totalP - 1e-6
                  ) {
                    return null;
                  }
                  const remainder = Math.round((totalP - paidN) * 10000) / 10000;
                  return (
                    <Text style={styles.remainderHint}>
                      Kalan {remainder.toLocaleString("tr-TR")} tedarikci borcu olarak kaydedilir.
                    </Text>
                  );
                })()}
                <View style={styles.confirmActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => {
                      if (saving) return;
                      setConfirmStep(1);
                    }}
                    disabled={saving}
                  >
                    <Text style={styles.cancelBtnText}>Geri</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={onSaveRetail} disabled={saving}>
                    <Text style={styles.confirmBtnText}>{saving ? "Kaydediliyor..." : "Kaydet"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  content: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 28
  },
  title: {
    color: COLORS.primary,
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 0
  },
  label: {
    color: COLORS.textLight,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 4
  },
  message: {
    color: COLORS.textLight,
    fontSize: 12,
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 12,
    fontSize: 14
  },
  selectBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.black,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  selectValue: {
    color: COLORS.primary,
    fontSize: 14,
    flex: 1,
    paddingRight: 8
  },
  selectPlaceholder: {
    color: "#666",
    fontSize: 14,
    flex: 1,
    paddingRight: 8
  },
  chevron: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700"
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8
  },
  buttonText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "800"
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
    maxHeight: "70%",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14
  },
  modalTitle: {
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 10
  },
  modalRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  modalRowText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "600"
  },
  modalEmpty: {
    color: COLORS.textLight,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16
  },
  confirmSheet: {
    marginHorizontal: HORIZONTAL_PADDING,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14
  },
  confirmRow: {
    color: COLORS.textLight,
    fontSize: 13,
    marginBottom: 6
  },
  confirmHighlight: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800",
    marginVertical: 8
  },
  paymentQuestion: {
    color: COLORS.textLight,
    fontSize: 12,
    lineHeight: 18,
    marginVertical: 10
  },
  remainderHint: {
    color: "#a8936a",
    fontSize: 12,
    marginBottom: 10
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8
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
