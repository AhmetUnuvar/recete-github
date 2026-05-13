import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Pressable
} from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";
import { getOwnedProducts, sellOwnedProduct } from "../services/productService";
import { getCustomers } from "../services/customerService";

export default function MyOwnedProductsScreen({ userId, refreshNonce = 0, onGoToRecipes }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [customers, setCustomers] = useState([]);
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellModalStep, setSellModalStep] = useState(1);
  const [sellTarget, setSellTarget] = useState(null);
  const [selectedBuyerId, setSelectedBuyerId] = useState(null);
  const [receivedAmountInput, setReceivedAmountInput] = useState("");
  const [selling, setSelling] = useState(false);

  const closeSellModal = () => {
    if (selling) return;
    setSellModalOpen(false);
    setSellModalStep(1);
    setSellTarget(null);
    setSelectedBuyerId(null);
    setReceivedAmountInput("");
  };

  const getSalePricePreview = () => {
    const n = Number(sellTarget?.price);
    return Number.isFinite(n) ? n : null;
  };

  const onSellModalContinue = () => {
    if (!selectedBuyerId) {
      Alert.alert("Uyari", "Lutfen bir musteri secin.");
      return;
    }
    const tp = getSalePricePreview();
    if (tp === null || tp <= 0) {
      Alert.alert("Uyari", "Satis fiyati okunamadi. Listeyi yenileyip tekrar deneyin.");
      return;
    }
    setReceivedAmountInput(String(Math.round(tp * 10000) / 10000));
    setSellModalStep(2);
  };

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setMessage("Giris yapilmamis.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      const data = await getOwnedProducts(userId);
      setRows(data);
      const customerRows = await getCustomers(userId, { isDone: false });
      setCustomers(customerRows);
    } catch (error) {
      setMessage(error.message || "Liste yuklenemedi.");
      setRows([]);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load, refreshNonce]);

  const onRefresh = async () => {
    if (!userId) return;
    try {
      setRefreshing(true);
      const data = await getOwnedProducts(userId);
      const customerRows = await getCustomers(userId, { isDone: false });
      setRows(data);
      setCustomers(customerRows);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Yenilenemedi.");
    } finally {
      setRefreshing(false);
    }
  };

  const filteredRows = rows.filter((item) =>
    !searchText.trim()
      ? true
      : String(item.product_name || "")
          .toLowerCase()
          .includes(searchText.trim().toLowerCase())
  );

  const handleSell = async (item) => {
    if (!userId || !item?.product_id) return;
    if (customers.length === 0) {
      Alert.alert(
        "Uyari",
        "Satis icin aktif (reçetesi tamamlanmamis) bir musteri yok. Tamamlanan musteriler bu listede gorunmez; Musteriler sayfasindan yeni musteri ekleyebilirsiniz."
      );
      return;
    }
    setSellTarget(item);
    setSelectedBuyerId(customers[0]?.id || null);
    setSellModalStep(1);
    setReceivedAmountInput("");
    setSellModalOpen(true);
  };

  const confirmSell = async () => {
    if (!userId || !sellTarget?.product_id || !selectedBuyerId) {
      Alert.alert("Uyari", "Lutfen bir musteri secin.");
      return;
    }
    const totalPrev = getSalePricePreview();
    if (totalPrev === null || totalPrev <= 0) {
      Alert.alert("Uyari", "Satis fiyati okunamadi.");
      return;
    }
    const recv = Number(String(receivedAmountInput || "").replace(",", "."));
    if (Number.isNaN(recv) || recv < 0) {
      Alert.alert("Uyari", "Tahsil ettiginiz tutar gecerli bir sayi olmalidir.");
      return;
    }
    if (recv > totalPrev + 1e-6) {
      Alert.alert("Uyari", "Tahsil ettiginiz tutar satis fiyatindan buyuk olamaz.");
      return;
    }
    try {
      setSelling(true);
      await sellOwnedProduct({
        userId,
        productId: sellTarget.product_id,
        buyerId: selectedBuyerId,
        received_amount: recv
      });
      setSellModalOpen(false);
      setSellModalStep(1);
      setSellTarget(null);
      setSelectedBuyerId(null);
      setReceivedAmountInput("");
      await load();
      Alert.alert("Basarili", "Urun satildi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Satis islemi basarisiz.");
    } finally {
      setSelling(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
      }
    >
      <View style={styles.pageTitleRow}>
        <Text style={[styles.title, styles.titleInHeader]} numberOfLines={2}>
          Ürünlerim
        </Text>
        {typeof onGoToRecipes === "function" ? (
          <TouchableOpacity style={styles.recipesBtn} onPress={onGoToRecipes} activeOpacity={0.85}>
            <Text style={styles.recipesBtnText} numberOfLines={2}>
              Ürün reçeteleri
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {!userId ? (
        <Text style={styles.messageText}>Gormek icin giris yapin.</Text>
      ) : null}
      {message ? <Text style={styles.messageText}>{message}</Text> : null}

      <View style={styles.searchBarWrap}>
        <TextInput
          style={styles.searchBarInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Urun adi ile ara"
          placeholderTextColor="#666"
        />
        {searchText.length > 0 ? (
          <TouchableOpacity
            style={styles.searchClearTouch}
            onPress={() => setSearchText("")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Aramayi temizle"
          >
            <Text style={styles.searchClearText}>×</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && rows.length === 0 ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
      ) : null}

      {filteredRows.length === 0 && !loading ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>
            {searchText.trim() ? "Aramaya uygun urun yok" : "Henuz uretilen urun yok"}
          </Text>
          <Text style={styles.emptyHint}>
            Urun Receteleri sayfasinda bir recetenin yanindaki &quot;Uret&quot; tusuna bastiginizda, stok dustukten sonra
            urun burada gorunur ve adet artar.
          </Text>
        </View>
      ) : (
        filteredRows.map((item) => {
          const n = Number(item.adet);
          const adetTxt = Number.isFinite(n) ? String(n) : "0";
          const priceVal = Number(item.price);
          const priceTxt = Number.isFinite(priceVal)
            ? priceVal.toLocaleString("tr-TR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
              })
            : "-";
          return (
            <View key={item.product_id} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={styles.cardTextWrap}>
                  <Text style={styles.cardTitle}>{item.product_name || "-"}</Text>
                  <Text style={styles.cardMeta}>Adet: {adetTxt}</Text>
                  <Text style={styles.cardPrice}>Satis Fiyati: {priceTxt}</Text>
                </View>
                <TouchableOpacity style={styles.sellBtn} activeOpacity={0.85} onPress={() => handleSell(item)}>
                  <Text style={styles.sellBtnText}>Sat</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <Modal
        visible={sellModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (selling) return;
          closeSellModal();
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => (selling ? null : closeSellModal())} />
          <View style={[styles.modalSheet, sellModalStep === 2 && styles.modalSheetTall]}>
            {sellModalStep === 1 ? (
              <>
                <Text style={styles.modalTitle}>Musteri Sec</Text>
                <Text style={styles.modalSubTitle}>Bu urunu hangi musteriye sattiniz?</Text>
                <ScrollView style={styles.modalList}>
                  {customers.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.customerRow, selectedBuyerId === c.id && styles.customerRowActive]}
                      onPress={() => setSelectedBuyerId(c.id)}
                    >
                      <Text style={[styles.customerName, selectedBuyerId === c.id && styles.customerNameActive]}>
                        {c.customer_name || "-"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={closeSellModal} disabled={selling}>
                    <Text style={styles.cancelBtnText}>Vazgec</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmBtn} onPress={onSellModalContinue} disabled={selling}>
                    <Text style={styles.confirmBtnText}>Devam</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Tahsilat</Text>
                <Text style={styles.modalSubTitle}>
                  {sellTarget?.product_name || "Urun"} — Satis fiyati (tahsil etmeniz gereken):{" "}
                  {getSalePricePreview() !== null
                    ? getSalePricePreview().toLocaleString("tr-TR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 4
                      })
                    : "-"}
                </Text>
                <Text style={styles.paymentQuestion}>
                  Bu satis icin simdilik ne kadar tahsil ettiniz? Tahsil ettiginiz miktar, islem kaydiniza o tutar olarak
                  girilir (ornek: 5000). Kalan ise Borclar Alacaklar sayfasinda musteri alaciniz olarak gorunur.
                </Text>
                <TextInput
                  style={styles.paymentInput}
                  value={receivedAmountInput}
                  onChangeText={setReceivedAmountInput}
                  placeholder="Tahsil edilen tutar"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  editable={!selling}
                />
                {(() => {
                  const totalP = getSalePricePreview();
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
                      Kalan {rem.toLocaleString("tr-TR")} için alacak kaydi oluşur (musteriye).
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
                    <Text style={styles.confirmBtnText}>{selling ? "Kaydediliyor..." : "Sat"}</Text>
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
  pageTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
    marginBottom: 10
  },
  title: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "800"
  },
  titleInHeader: { flex: 1, flexShrink: 1, marginBottom: 0 },
  recipesBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignSelf: "flex-start",
    maxWidth: "48%"
  },
  recipesBtnText: {
    color: COLORS.black,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  searchBarWrap: {
    position: "relative",
    width: "100%",
    marginBottom: 14
  },
  searchBarInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 11,
    paddingRight: 42,
    fontSize: 15
  },
  searchClearTouch: {
    position: "absolute",
    right: 2,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  searchClearText: {
    color: COLORS.textLight,
    fontSize: 22,
    lineHeight: 24
  },
  messageText: {
    color: COLORS.textLight,
    fontSize: 13,
    marginBottom: 8
  },
  loader: {
    marginVertical: 20
  },
  emptyBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.black,
    padding: 18
  },
  emptyTitle: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8
  },
  emptyHint: {
    color: COLORS.textLight,
    fontSize: 13,
    lineHeight: 19
  },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    padding: 14,
    marginBottom: 10
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  cardTextWrap: {
    flex: 1
  },
  cardTitle: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "700"
  },
  cardMeta: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8
  },
  cardPrice: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6
  },
  sellBtn: {
    backgroundColor: "#28a745",
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  sellBtnText: {
    color: "#ffffff",
    fontSize: 13,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12
  },
  modalSheetTall: {
    maxHeight: "82%"
  },
  paymentQuestion: {
    color: COLORS.textLight,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10
  },
  paymentInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    fontSize: 15,
    marginBottom: 10
  },
  remainderHint: {
    color: "#a8936a",
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8
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
    marginBottom: 8
  },
  modalList: {
    maxHeight: 280
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
    fontSize: 13,
    fontWeight: "600"
  },
  customerNameActive: {
    color: COLORS.primary
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 6
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  cancelBtnText: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: "700"
  },
  confirmBtn: {
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#28a745"
  },
  confirmBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800"
  }
});
