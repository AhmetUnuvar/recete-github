import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  FlatList,
  TextInput
} from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";
import { getProducts, produceProduct, updateProduct, deleteProduct } from "../services/productService";
import { getStocks } from "../services/stockService";
import {
  dismissNotification,
  getPendingNotificationsForPage,
  TARGET_PAGE_MY_RECIPES
} from "../services/notificationService";
import PageHeaderRightActions from "../components/PageHeaderRightActions";

/** Bildirim metnini bloklara böler (paragraf ve madde işaretleri). */
const parseNoticeMessage = (raw) => {
  const blocks = [];
  const paraLines = [];
  let bullets = [];
  const flushPara = () => {
    const t = paraLines.join(" ").trim();
    if (t) blocks.push({ type: "paragraph", text: t });
    paraLines.length = 0;
  };
  const flushBullets = () => {
    if (bullets.length) blocks.push({ type: "bullets", items: bullets.slice() });
    bullets.length = 0;
  };

  const allLines = String(raw || "").split(/\r?\n/);
  for (const rawLine of allLines) {
    const line = rawLine.trim();
    if (!line) {
      flushBullets();
      flushPara();
      continue;
    }
    if (/^-\s+/.test(line) || /^•\s+/.test(line)) {
      flushPara();
      bullets.push(line.replace(/^[-•]\s+/, "").trim());
    } else {
      flushBullets();
      paraLines.push(line);
    }
  }
  flushBullets();
  flushPara();
  return blocks;
};

export default function MyProductsScreen({
  userId,
  myProductsFocusNonce = 0,
  onStocksAffected,
  onOwnedProductsAffected,
  onAddRecipe
}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [producingId, setProducingId] = useState(null);
  const [stockById, setStockById] = useState({});
  const [recipeModalProduct, setRecipeModalProduct] = useState(null);

  const [editingProduct, setEditingProduct] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingMaterials, setEditingMaterials] = useState([]);
  const [editingHours, setEditingHours] = useState("1");
  const [savingEdit, setSavingEdit] = useState(false);
  const [recipesNotice, setRecipesNotice] = useState(null);
  const [recipesNoticeModalOpen, setRecipesNoticeModalOpen] = useState(false);
  const [recipesNoticeCloseLoading, setRecipesNoticeCloseLoading] = useState(false);
  const [dontShowRecipesNoticeAgain, setDontShowRecipesNoticeAgain] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!userId) {
      setProducts([]);
      setStockById({});
      setMessage("Giris yapilmamis.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      const [rows, stocks] = await Promise.all([getProducts(userId), getStocks(userId)]);
      setProducts(rows);
      const map = {};
      for (const s of stocks) {
        if (s?.id) map[String(s.id)] = s;
      }
      setStockById(map);
    } catch (error) {
      setMessage(error.message || "Urunler yuklenemedi.");
      setProducts([]);
      setStockById({});
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setRecipesNotice(null);
        setRecipesNoticeModalOpen(false);
        return;
      }
      try {
        const list = await getPendingNotificationsForPage({
          userId,
          targetPage: TARGET_PAGE_MY_RECIPES
        });
        if (cancelled) return;
        const first = list[0];
        if (first?.id) {
          setRecipesNotice(first);
          setRecipesNoticeModalOpen(true);
        } else {
          setRecipesNotice(null);
          setRecipesNoticeModalOpen(false);
        }
      } catch (e) {
        if (__DEV__ && !cancelled) {
          console.warn("[MyProductsScreen] Bildirim yuklenemedi:", e?.message || e);
        }
        if (!cancelled) {
          setRecipesNotice(null);
          setRecipesNoticeModalOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, myProductsFocusNonce]);

  useEffect(() => {
    setDontShowRecipesNoticeAgain(false);
  }, [recipesNotice?.id]);

  const finalizeRecipesNoticeModal = useCallback(async () => {
    if (recipesNoticeCloseLoading || !recipesNotice) return;
    const shouldDismiss = dontShowRecipesNoticeAgain && userId && recipesNotice?.id;
    try {
      if (shouldDismiss) setRecipesNoticeCloseLoading(true);
      if (shouldDismiss) await dismissNotification({ userId, notificationId: recipesNotice.id });
    } catch (_e) {
      /* tekrar denenebilir */
    } finally {
      setRecipesNoticeCloseLoading(false);
      setRecipesNoticeModalOpen(false);
      if (shouldDismiss) setRecipesNotice(null);
    }
  }, [recipesNoticeCloseLoading, recipesNotice, dontShowRecipesNoticeAgain, userId]);

  const onRefresh = async () => {
    if (!userId) return;
    try {
      setRefreshing(true);
      const [rows, stocks] = await Promise.all([getProducts(userId), getStocks(userId)]);
      setProducts(rows);
      const map = {};
      for (const s of stocks) {
        if (s?.id) map[String(s.id)] = s;
      }
      setStockById(map);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Yenilenemedi.");
    } finally {
      setRefreshing(false);
    }
  };

  const formatStockCount = (stockId) => {
    if (Array.isArray(stockId)) return stockId.length;
    return 0;
  };

  const recipeLinesFromProduct = (product) => {
    if (Array.isArray(product?.materials) && product.materials.length > 0) return product.materials;
    if (Array.isArray(product?.stock_id)) {
      return product.stock_id
        .map((sidRaw) => (sidRaw != null ? String(sidRaw) : ""))
        .filter((sid) => sid.length > 0)
        .map((sid) => {
          const st = stockById[sid];
          const fallbackUnit = st?.unit_name || "adet";
          return {
            stock_id: sid,
            quantity: 1,
            quantity_unit: fallbackUnit,
            stock_unit: fallbackUnit,
            qty_in_stock_units: 1
          };
        });
    }
    return [];
  };

  const recipeModalLines = useMemo(
    () => recipeLinesFromProduct(recipeModalProduct),
    [recipeModalProduct]
  );

  const formatQty = (v) => {
    const n = Number(v);
    if (Number.isNaN(n)) return String(v ?? "-");
    if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
    return parseFloat(n.toFixed(4)).toString();
  };

  const hoursFromProduct = (p) => {
    const th = Number(p?.total_hours);
    if (Number.isFinite(th) && th > 0) {
      return Math.abs(th - Math.round(th)) < 1e-6 ? String(Math.round(th)) : String(parseFloat(th.toFixed(4)));
    }
    const d = Number(p?.total_days);
    return String(Math.max(1, Number.isFinite(d) && d > 0 ? d : 1) * 24);
  };

  const startEditProduct = (product) => {
    const lines = recipeLinesFromProduct(product);
    setEditingProduct(product);
    setEditingName(product?.product_name || "");
    setEditingHours(hoursFromProduct(product));
    setEditingMaterials(
      lines.map((ln, idx) => {
        const sid = ln.stock_id != null ? String(ln.stock_id) : "";
        return {
          key: `${sid}-${idx}-${Date.now()}`,
          stock_id: sid,
          stock_name: stockById[sid]?.stock_name || sid || "-",
          quantity: ln.quantity != null ? String(ln.quantity) : "",
          quantity_unit: ln.quantity_unit || ln.stock_unit || ""
        };
      })
    );
  };

  const handleSaveEdit = async () => {
    if (!editingProduct?.id || !userId) return;
    if (!String(editingName || "").trim()) {
      Alert.alert("Uyari", "Urun adi zorunlu.");
      return;
    }
    const materials = editingMaterials
      .map((m) => ({
        stock_id: m.stock_id,
        quantity: Number(String(m.quantity).replace(",", ".")),
        quantity_unit: String(m.quantity_unit || "").trim()
      }))
      .filter((m) => m.stock_id && !Number.isNaN(m.quantity) && m.quantity > 0 && m.quantity_unit);

    if (materials.length !== editingMaterials.length || materials.length === 0) {
      Alert.alert("Uyari", "Tum malzemeler icin gecerli miktar ve birim girin.");
      return;
    }

    const totalHoursParsed = Number(String(editingHours).trim().replace(",", "."));
    if (!Number.isFinite(totalHoursParsed) || totalHoursParsed < 0) {
      Alert.alert("Uyari", "Uretim suresi saat olarak 0 veya pozitif bir sayi olmali.");
      return;
    }

    try {
      setSavingEdit(true);
      await updateProduct({
        userId,
        productId: editingProduct.id,
        productName: editingName.trim(),
        materials,
        totalHours: totalHoursParsed
      });
      setEditingProduct(null);
      setEditingMaterials([]);
      setEditingHours("1");
      await loadProducts();
      Alert.alert("Basarili", "Urun recetesi guncellendi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Urun guncellenemedi.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteProduct = (product) => {
    Alert.alert("Urunu sil", `\"${product.product_name}\" recetesini silmek istiyor musunuz?`, [
      { text: "Vazgec", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteProduct({ userId, productId: product.id });
            if (recipeModalProduct?.id === product.id) {
              setRecipeModalProduct(null);
            }
            await loadProducts();
            Alert.alert("Silindi", "Urun recetesi silindi.");
          } catch (error) {
            Alert.alert("Hata", error.message || "Urun silinemedi.");
          }
        }
      }
    ]);
  };

  const handleProduce = async (productId) => {
    if (!userId || !productId) return;
    try {
      setProducingId(productId);
      await produceProduct({ userId, productId });
      if (typeof onStocksAffected === "function") onStocksAffected();
      if (typeof onOwnedProductsAffected === "function") onOwnedProductsAffected();
      Alert.alert("Tamam", "Malzemeler stoktan dusuruldu. Urun Ürünlerim sayfasinda listelenir.");
    } catch (error) {
      Alert.alert("Uretilemedi", error.message || "Bilinmeyen hata.");
    } finally {
      setProducingId(null);
    }
  };

  const renderRecipesNoticeModal = () => (
    <Modal
      visible={recipesNoticeModalOpen && recipesNotice != null}
      transparent
      animationType="fade"
      onRequestClose={finalizeRecipesNoticeModal}
    >
      <View style={styles.welcomeModalRoot}>
        <Pressable style={styles.welcomeModalBackdrop} onPress={finalizeRecipesNoticeModal} />
        <View style={styles.welcomeModalCard}>
          <View style={styles.welcomeModalAccent} />
          <Text style={styles.welcomeModalKicker}>BİLGİLENDİRME</Text>
          <Text style={styles.welcomeModalTitle}>{recipesNotice?.title || ""}</Text>
          <ScrollView
            style={styles.welcomeModalScroll}
            contentContainerStyle={styles.welcomeModalScrollInner}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {parseNoticeMessage(recipesNotice?.message).map((block, idx) => {
              if (block.type === "paragraph") {
                return (
                  <Text key={`p-${idx}`} style={styles.welcomeModalParagraph}>
                    {block.text}
                  </Text>
                );
              }
              return (
                <View key={`b-${idx}`} style={styles.welcomeModalBulletBlock}>
                  {block.items.map((item, j) => (
                    <View key={`${idx}-${j}`} style={styles.welcomeModalBulletRow}>
                      <View style={styles.welcomeModalBulletDot} />
                      <Text style={styles.welcomeModalBulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.welcomeCheckRow}
            onPress={() => setDontShowRecipesNoticeAgain((v) => !v)}
            activeOpacity={0.75}
            disabled={recipesNoticeCloseLoading}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowRecipesNoticeAgain }}
          >
            <View style={[styles.welcomeCheckbox, dontShowRecipesNoticeAgain && styles.welcomeCheckboxOn]}>
              {dontShowRecipesNoticeAgain ? <Text style={styles.welcomeCheckboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.welcomeCheckboxLabel}>Bu bildirimi bir daha gösterme</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.welcomeOkBtn, recipesNoticeCloseLoading && styles.welcomeOkBtnDisabled]}
            onPress={finalizeRecipesNoticeModal}
            disabled={recipesNoticeCloseLoading}
            activeOpacity={0.88}
          >
            <Text style={styles.welcomeOkBtnText}>
              {recipesNoticeCloseLoading ? "Kaydediliyor..." : "Tamam"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, styles.titleInHeader]} numberOfLines={2}>
          Urun Receteleri
        </Text>
        <PageHeaderRightActions>
          {typeof onAddRecipe === "function" ? (
            <TouchableOpacity style={styles.addRecipeBtn} onPress={onAddRecipe} activeOpacity={0.85}>
              <Text style={styles.addRecipeBtnText} numberOfLines={2}>
                Ürün reçetesi ekle
              </Text>
            </TouchableOpacity>
          ) : null}
        </PageHeaderRightActions>
      </View>

      {!userId ? <Text style={styles.messageText}>Urunleri gormek icin giris yapin.</Text> : null}
      {message ? <Text style={styles.messageText}>{message}</Text> : null}

      {loading && products.length === 0 ? <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} /> : null}

      {products.length === 0 && !loading ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Henuz urun yok</Text>
          <Text style={styles.emptyHint}>
            Urun Ekle sayfasindan kayit acabilirsiniz. Listeyi guncellemek icin sayfayi asagi cekin.
          </Text>
        </View>
      ) : (
        products.map((item) => {
          const costVal = Number(item.cost ?? item.material_cost_total);
          const costTxt = Number.isFinite(costVal) ? costVal.toFixed(2) : "0";
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <TouchableOpacity style={styles.cardHeaderText} activeOpacity={0.75} onPress={() => setRecipeModalProduct(item)}>
                  <Text style={styles.cardTitle}>{item.product_name}</Text>
                  <Text style={styles.cardTapHint}>Malzemeleri gormek icin dokunun</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.produceBtn, producingId === item.id && styles.produceBtnDisabled]}
                  disabled={!!producingId}
                  onPress={() => handleProduce(item.id)}
                >
                  <Text style={styles.produceBtnText}>{producingId === item.id ? "..." : "Uret"}</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity activeOpacity={0.75} onPress={() => setRecipeModalProduct(item)}>
                <Text style={styles.cardMeta}>Malzeme sayisi: {formatStockCount(item.stock_id)}</Text>
                <Text style={styles.cardCost}>Uretim maliyeti (malzeme): {costTxt}</Text>
              </TouchableOpacity>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => startEditProduct(item)}>
                  <Text style={styles.secondaryBtnText}>Duzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteProduct(item)}>
                  <Text style={styles.deleteBtnText}>Sil</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <Modal visible={recipeModalProduct != null} transparent animationType="fade" onRequestClose={() => setRecipeModalProduct(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={[StyleSheet.absoluteFillObject, styles.modalBackdrop]} onPress={() => setRecipeModalProduct(null)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{recipeModalProduct?.product_name || "Recete"}</Text>
            <Text style={styles.modalSubtitle}>Malzemeler</Text>
            {recipeModalLines.length === 0 ? (
              <Text style={styles.modalEmpty}>Bu urunde stock_id icinde malzeme bulunamadi.</Text>
            ) : (
              <FlatList
                data={recipeModalLines}
                keyExtractor={(ln, idx) => `${ln.stock_id}-${idx}`}
                style={styles.modalList}
                nestedScrollEnabled
                renderItem={({ item: ln }) => {
                  const sid = ln.stock_id != null ? String(ln.stock_id) : "";
                  const st = sid ? stockById[sid] : null;
                  const name = st?.stock_name || sid || "?";
                  const qIn = ln.quantity != null ? formatQty(ln.quantity) : "-";
                  const unitIn = ln.quantity_unit || ln.stock_unit || "";
                  const qStock = ln.qty_in_stock_units != null ? formatQty(ln.qty_in_stock_units) : "-";
                  const stockUnit = ln.stock_unit || "";
                  return (
                    <View style={styles.recipeRow}>
                      <Text style={styles.recipeRowName}>{name}</Text>
                      <Text style={styles.recipeRowDetail}>Recetede: {qIn} {unitIn}</Text>
                      <Text style={styles.recipeRowDetailMuted}>Stok birimi ({stockUnit}) karsiligi: {qStock}</Text>
                    </View>
                  );
                }}
              />
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setRecipeModalProduct(null)}>
              <Text style={styles.modalCloseBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={editingProduct != null} transparent animationType="fade" onRequestClose={() => setEditingProduct(null)}>
        <View style={styles.modalRoot}>
          <Pressable style={[StyleSheet.absoluteFillObject, styles.modalBackdrop]} onPress={() => !savingEdit && setEditingProduct(null)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Recete Duzenle</Text>
            <TextInput
              style={styles.editInput}
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Urun adi"
              placeholderTextColor="#999"
            />
            <Text style={styles.editHoursLabel}>Uretim suresi (saat)</Text>
            <TextInput
              style={styles.editInput}
              value={editingHours}
              onChangeText={setEditingHours}
              placeholder="Orn: 2"
              placeholderTextColor="#999"
              keyboardType="decimal-pad"
              editable={!savingEdit}
            />
            <FlatList
              data={editingMaterials}
              keyExtractor={(item) => item.key}
              style={styles.modalList}
              nestedScrollEnabled
              renderItem={({ item, index }) => (
                <View style={styles.editRow}>
                  <Text style={styles.editRowName}>{item.stock_name}</Text>
                  <View style={styles.editRowInputs}>
                    <TextInput
                      style={[styles.editInput, styles.qtyInput]}
                      value={item.quantity}
                      keyboardType="decimal-pad"
                      onChangeText={(txt) => {
                        setEditingMaterials((prev) => {
                          const copy = [...prev];
                          copy[index] = { ...copy[index], quantity: txt.replace(",", ".") };
                          return copy;
                        });
                      }}
                      placeholder="Miktar"
                      placeholderTextColor="#999"
                    />
                    <TextInput
                      style={[styles.editInput, styles.unitInput]}
                      value={item.quantity_unit}
                      onChangeText={(txt) => {
                        setEditingMaterials((prev) => {
                          const copy = [...prev];
                          copy[index] = { ...copy[index], quantity_unit: txt };
                          return copy;
                        });
                      }}
                      placeholder="Birim"
                      placeholderTextColor="#999"
                    />
                  </View>
                </View>
              )}
            />
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                disabled={savingEdit}
                onPress={() => {
                  setEditingProduct(null);
                  setEditingHours("1");
                }}
              >
                <Text style={styles.secondaryBtnText}>Iptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.produceBtn} disabled={savingEdit} onPress={handleSaveEdit}>
                <Text style={styles.produceBtnText}>{savingEdit ? "Kaydediliyor..." : "Kaydet"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    {renderRecipesNoticeModal()}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
    marginBottom: 10
  },
  title: { color: COLORS.primary, fontSize: 30, fontWeight: "800" },
  titleInHeader: { flex: 1, flexShrink: 1, marginBottom: 0 },
  addRecipeBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignSelf: "flex-start",
    maxWidth: "46%"
  },
  addRecipeBtnText: {
    color: COLORS.black,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  messageText: { color: COLORS.textLight, fontSize: 13, marginBottom: 8 },
  loader: { marginVertical: 20 },
  emptyBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, backgroundColor: COLORS.black, padding: 18 },
  emptyTitle: { color: COLORS.primary, fontSize: 16, fontWeight: "700", marginBottom: 8 },
  emptyHint: { color: COLORS.textLight, fontSize: 13, lineHeight: 19 },
  card: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.black, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  cardHeaderText: { flex: 1, paddingRight: 8 },
  cardTapHint: { color: COLORS.textLight, fontSize: 11, marginTop: 4, fontStyle: "italic" },
  produceBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: COLORS.primary },
  produceBtnDisabled: { opacity: 0.65 },
  produceBtnText: { color: COLORS.black, fontSize: 13, fontWeight: "800" },
  cardTitle: { color: COLORS.primary, fontSize: 15, fontWeight: "700" },
  cardMeta: { color: COLORS.textLight, fontSize: 12, marginTop: 6 },
  cardCost: { color: COLORS.primary, fontSize: 13, fontWeight: "700", marginTop: 10 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14
  },
  secondaryBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: "700" },
  deleteBtn: { borderWidth: 1, borderColor: "#d9534f", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  deleteBtnText: { color: "#d9534f", fontSize: 12, fontWeight: "700" },
  modalRoot: { flex: 1, justifyContent: "center", paddingHorizontal: HORIZONTAL_PADDING },
  modalBackdrop: { backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: {
    backgroundColor: COLORS.black,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    maxHeight: "80%"
  },
  modalTitle: { color: COLORS.primary, fontSize: 18, fontWeight: "800", marginBottom: 4 },
  modalSubtitle: { color: COLORS.textLight, fontSize: 13, fontWeight: "600", marginBottom: 12 },
  modalEmpty: { color: COLORS.textLight, fontSize: 13, marginBottom: 12 },
  modalList: { flexGrow: 0, marginBottom: 12 },
  recipeRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  recipeRowName: { color: COLORS.primary, fontSize: 15, fontWeight: "700" },
  recipeRowDetail: { color: COLORS.textLight, fontSize: 13, marginTop: 4 },
  recipeRowDetailMuted: { color: COLORS.textLight, fontSize: 12, marginTop: 2, opacity: 0.85 },
  modalCloseBtn: {
    alignSelf: "stretch",
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  modalCloseBtnText: { color: COLORS.black, fontWeight: "800", fontSize: 15 },
  editInput: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    color: COLORS.textLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10
  },
  editHoursLabel: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4
  },
  editRow: { borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 10, marginBottom: 10 },
  editRowName: { color: COLORS.primary, fontWeight: "700", marginBottom: 8 },
  editRowInputs: { flexDirection: "row", gap: 8 },
  qtyInput: { flex: 1, marginBottom: 0 },
  unitInput: { flex: 1, marginBottom: 0 },
  welcomeModalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: HORIZONTAL_PADDING
  },
  welcomeModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.82)"
  },
  welcomeModalCard: {
    backgroundColor: "#141414",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    maxHeight: "78%",
    paddingBottom: 20,
    paddingHorizontal: 20,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20
  },
  welcomeModalAccent: {
    height: 5,
    backgroundColor: COLORS.primary,
    marginHorizontal: -20,
    marginBottom: 16
  },
  welcomeModalKicker: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 8,
    opacity: 0.9
  },
  welcomeModalTitle: {
    color: COLORS.textLight,
    fontSize: 23,
    fontWeight: "800",
    marginBottom: 18,
    lineHeight: 30
  },
  welcomeModalScroll: {
    maxHeight: 300,
    marginBottom: 16
  },
  welcomeModalScrollInner: {
    paddingBottom: 6
  },
  welcomeModalParagraph: {
    color: COLORS.textLight,
    fontSize: 15,
    lineHeight: 24,
    opacity: 0.95,
    marginBottom: 14
  },
  welcomeModalBulletBlock: {
    marginTop: 4,
    marginBottom: 6
  },
  welcomeModalBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10
  },
  welcomeModalBulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 8,
    opacity: 0.9
  },
  welcomeModalBulletText: {
    flex: 1,
    color: COLORS.textLight,
    fontSize: 15,
    lineHeight: 23,
    opacity: 0.92
  },
  welcomeCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingVertical: 4
  },
  welcomeCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    backgroundColor: COLORS.black
  },
  welcomeCheckboxOn: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary
  },
  welcomeCheckboxTick: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "900",
    marginTop: -1
  },
  welcomeCheckboxLabel: {
    flex: 1,
    color: COLORS.textLight,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600"
  },
  welcomeOkBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center"
  },
  welcomeOkBtnDisabled: {
    opacity: 0.65
  },
  welcomeOkBtnText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "800"
  }
});
