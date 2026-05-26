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
  Pressable
} from "react-native";
import { COLORS } from "../constants/colors";
import PageTitleRow from "../components/PageTitleRow";
import { HORIZONTAL_PADDING } from "../constants/layout";
import {
  createStock,
  createStockCategory,
  createSeller,
  createUnit,
  getCurrencies,
  getSellers,
  getStockCategories,
  getUnits
} from "../services/stockService";
import {
  dismissNotification,
  getPendingNotificationsForPage,
  TARGET_PAGE_STOCK_ADD
} from "../services/notificationService";
import KdvPriceInput from "../components/KdvPriceInput";
import { resolvePriceWithKdv } from "../utils/kdv";

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

export default function StockOperationsScreen({ userId, stockOpsFocusNonce = 0 }) {
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [category, setCategory] = useState(null);
  const [unit, setUnit] = useState(null);
  const [currency, setCurrency] = useState(null);
  const [seller, setSeller] = useState(null);
  const [stockName, setStockName] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [unitCostKdvIncluded, setUnitCostKdvIncluded] = useState(false);
  const [unitCostKdvRate, setUnitCostKdvRate] = useState(null);
  const [stockMiktari, setStockMiktari] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [newSellerName, setNewSellerName] = useState("");
  const [categoryMessage, setCategoryMessage] = useState("");
  const [unitMessage, setUnitMessage] = useState("");
  const [stockMessage, setStockMessage] = useState("");
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [currenciesLoading, setCurrenciesLoading] = useState(false);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [stockAddNotice, setStockAddNotice] = useState(null);
  const [stockAddNoticeModalOpen, setStockAddNoticeModalOpen] = useState(false);
  const [stockAddNoticeCloseLoading, setStockAddNoticeCloseLoading] = useState(false);
  const [dontShowStockAddNoticeAgain, setDontShowStockAddNoticeAgain] = useState(false);

  const [openPicker, setOpenPicker] = useState(null);
  const [showCategoryAddModal, setShowCategoryAddModal] = useState(false);
  const [showUnitAddModal, setShowUnitAddModal] = useState(false);
  const [showSellerAddModal, setShowSellerAddModal] = useState(false);
  const [showStockConfirmModal, setShowStockConfirmModal] = useState(false);
  const [stockConfirmStep, setStockConfirmStep] = useState(1);
  const [paidAmountInput, setPaidAmountInput] = useState("");

  const closePicker = () => setOpenPicker(null);

  const getResolvedUnitCost = () =>
    resolvePriceWithKdv(unitCost, unitCostKdvIncluded, unitCostKdvRate);

  const getStockTotalPreview = () => {
    const q = Number(String(stockMiktari || "").replace(",", "."));
    const costResolved = getResolvedUnitCost();
    if (Number.isNaN(q) || q < 0 || !costResolved.ok) return null;
    const c = costResolved.final;
    return Math.round(q * c * 10000) / 10000;
  };

  const closeStockConfirmModal = () => {
    setShowStockConfirmModal(false);
    setStockConfirmStep(1);
    setPaidAmountInput("");
  };

  const onStockConfirmContinue = () => {
    const t = getStockTotalPreview();
    if (t === null) {
      setStockMessage("Toplam tutar hesaplanamadi. Miktar ve birim maliyeti kontrol edin.");
      return;
    }
    setPaidAmountInput(String(Math.round(t * 10000) / 10000));
    setStockConfirmStep(2);
    setStockMessage("");
  };

  useEffect(() => {
    const loadCategories = async () => {
      if (!userId) {
        setCategories([]);
        return;
      }
      try {
        setCategoriesLoading(true);
        const rows = await getStockCategories(userId);
        setCategories(rows);
      } catch (error) {
        setCategoryMessage(error.message || "Kategoriler yuklenemedi.");
      } finally {
        setCategoriesLoading(false);
      }
    };
    const loadSellers = async () => {
      if (!userId) {
        setSellers([]);
        return;
      }
      try {
        setSellersLoading(true);
        const rows = await getSellers(userId);
        setSellers(rows);
      } catch (error) {
        setCategoryMessage(error.message || "Saticilar yuklenemedi.");
      } finally {
        setSellersLoading(false);
      }
    };
    const loadUnits = async () => {
      if (!userId) {
        setUnits([]);
        return;
      }
      try {
        setUnitsLoading(true);
        const rows = await getUnits(userId);
        setUnits(rows);
      } catch (error) {
        setUnitMessage(error.message || "Birimler yuklenemedi.");
      } finally {
        setUnitsLoading(false);
      }
    };
    const loadCurrencies = async () => {
      try {
        setCurrenciesLoading(true);
        const rows = await getCurrencies();
        setCurrencies(rows);
      } catch (error) {
        setCategoryMessage(error.message || "Para birimleri yuklenemedi.");
      } finally {
        setCurrenciesLoading(false);
      }
    };
    loadCategories();
    loadUnits();
    loadCurrencies();
    loadSellers();
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setStockAddNotice(null);
        setStockAddNoticeModalOpen(false);
        return;
      }
      try {
        const list = await getPendingNotificationsForPage({
          userId,
          targetPage: TARGET_PAGE_STOCK_ADD
        });
        if (cancelled) return;
        const first = list[0];
        if (first?.id) {
          setStockAddNotice(first);
          setStockAddNoticeModalOpen(true);
        } else {
          setStockAddNotice(null);
          setStockAddNoticeModalOpen(false);
        }
      } catch (e) {
        if (__DEV__ && !cancelled) {
          console.warn("[StockOperationsScreen] Bildirim yuklenemedi:", e?.message || e);
        }
        if (!cancelled) {
          setStockAddNotice(null);
          setStockAddNoticeModalOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, stockOpsFocusNonce]);

  useEffect(() => {
    setDontShowStockAddNoticeAgain(false);
  }, [stockAddNotice?.id]);

  const finalizeStockAddNoticeModal = useCallback(async () => {
    if (stockAddNoticeCloseLoading || !stockAddNotice) return;
    const shouldDismiss = dontShowStockAddNoticeAgain && userId && stockAddNotice?.id;
    try {
      if (shouldDismiss) setStockAddNoticeCloseLoading(true);
      if (shouldDismiss) await dismissNotification({ userId, notificationId: stockAddNotice.id });
    } catch (_e) {
      /* tekrar denenebilir */
    } finally {
      setStockAddNoticeCloseLoading(false);
      setStockAddNoticeModalOpen(false);
      if (shouldDismiss) setStockAddNotice(null);
    }
  }, [stockAddNoticeCloseLoading, stockAddNotice, dontShowStockAddNoticeAgain, userId]);

  const getOptionLabel = (key, item) => {
    if (key === "category") return item.stock_category_name;
    if (key === "unit") return item.unit_name;
    if (key === "seller") return item.seller_name;
    return `${item.currency_name} (${item.currency_abbreviation})`;
  };

  const renderPickerModal = (key, data, onSelect, header) => (
    <Modal visible={openPicker === key} transparent animationType="fade" onRequestClose={closePicker}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={closePicker} />
        <View style={styles.modalSheet}>
          <View style={styles.modalTitleRow}>
            <Text style={styles.modalTitle}>{header}</Text>
            {key === "seller" ? (
              <TouchableOpacity
                style={styles.modalTopActionButton}
                onPress={() => {
                  closePicker();
                  setShowSellerAddModal(true);
                }}
              >
                <Text style={styles.modalTopActionText}>Satici Ekle</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalRow}
                onPress={() => {
                  onSelect(item);
                  closePicker();
                }}
              >
                <Text style={styles.modalRowText}>{getOptionLabel(key, item)}</Text>
              </TouchableOpacity>
            )}
          />
          {key === "category" && (
            <TouchableOpacity
              style={styles.addCategoryButton}
              onPress={() => {
                closePicker();
                setShowCategoryAddModal(true);
              }}
            >
              <Text style={styles.addCategoryButtonText}>Stok Kategorisi Ekle</Text>
            </TouchableOpacity>
          )}
          {key === "unit" && (
            <TouchableOpacity
              style={styles.addCategoryButton}
              onPress={() => {
                closePicker();
                setShowUnitAddModal(true);
              }}
            >
              <Text style={styles.addCategoryButtonText}>Birim Ekle</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );

  const onSaveCategory = async () => {
    try {
      setCategoryMessage("");
      const created = await createStockCategory(newCategoryName, userId);
      setCategories((prev) => [created, ...prev]);
      setCategory(created);
      setNewCategoryName("");
      setCategoryMessage("Kategori eklendi.");
      setShowCategoryAddModal(false);
    } catch (error) {
      setCategoryMessage(error.message || "Kategori eklenemedi.");
    }
  };

  const onSaveUnit = async () => {
    try {
      setUnitMessage("");
      const created = await createUnit(newUnitName, userId);
      setUnits((prev) => [created, ...prev]);
      setUnit(created);
      setNewUnitName("");
      setUnitMessage("Birim eklendi.");
      setShowUnitAddModal(false);
    } catch (error) {
      setUnitMessage(error.message || "Birim eklenemedi.");
    }
  };

  const onSaveSeller = async () => {
    try {
      setCategoryMessage("");
      const created = await createSeller(newSellerName, userId);
      setSellers((prev) => [created, ...prev]);
      setSeller(created);
      setNewSellerName("");
      setCategoryMessage("Satici eklendi.");
      setShowSellerAddModal(false);
    } catch (error) {
      setCategoryMessage(error.message || "Satici eklenemedi.");
    }
  };

  const validateStockForm = () => {
    if (!userId) {
      throw new Error("Kullanici bilgisi bulunamadi. Lutfen tekrar giris yapin.");
    }
    if (!category?.id || !unit?.id || !currency?.id || !seller?.id) {
      throw new Error("Kategori, birim, para birimi ve satici secimi zorunludur.");
    }
    if (!stockName.trim()) {
      throw new Error("Stok adi zorunludur.");
    }
    if (!stockMiktari.trim() || !unitCost.trim()) {
      throw new Error("Stok miktari ve birim maliyeti zorunludur.");
    }
  };

  const onOpenStockConfirm = () => {
    try {
      setStockMessage("");
      validateStockForm();
      const costResolved = getResolvedUnitCost();
      if (!costResolved.ok) {
        throw new Error(costResolved.message);
      }
      setStockConfirmStep(1);
      setPaidAmountInput("");
      setShowStockConfirmModal(true);
    } catch (error) {
      setStockMessage(error.message || "Lutfen tum zorunlu alanlari doldurun.");
    }
  };

  const onSaveStock = async () => {
    try {
      setStockMessage("");
      validateStockForm();

      const totalPrev = getStockTotalPreview();
      if (totalPrev === null) {
        setStockMessage("Toplam tutar hesaplanamadi.");
        return;
      }
      const paid = Number(String(paidAmountInput || "").replace(",", "."));
      if (Number.isNaN(paid) || paid < 0) {
        setStockMessage("Odediginiz tutar gecerli bir sayi olmalidir.");
        return;
      }
      if (paid > totalPrev + 1e-6) {
        setStockMessage("Odenen tutar toplamdan buyuk olamaz.");
        return;
      }

      const costResolved = getResolvedUnitCost();
      if (!costResolved.ok) {
        setStockMessage(costResolved.message);
        return;
      }

      setIsSavingStock(true);
      await createStock({
        user_id: userId,
        stock_category_id: category.id,
        stock_name: stockName.trim(),
        stock_quantity: stockMiktari.trim().replace(",", "."),
        unit_id: unit.id,
        unit_cost: String(costResolved.final),
        seller_id: seller.id,
        currency_id: currency.id,
        paid_amount: paid
      });

      setStockMessage("Stok basariyla kaydedildi.");
      setStockName("");
      setStockMiktari("");
      setUnitCost("");
      setUnitCostKdvIncluded(false);
      setUnitCostKdvRate(null);
      setCategory(null);
      setUnit(null);
      setCurrency(null);
      setSeller(null);
      closeStockConfirmModal();
    } catch (error) {
      setStockMessage(error.message || "Stok kaydedilemedi.");
    } finally {
      setIsSavingStock(false);
    }
  };

  const renderStockAddNoticeModal = () => (
    <Modal
      visible={stockAddNoticeModalOpen && stockAddNotice != null}
      transparent
      animationType="fade"
      onRequestClose={finalizeStockAddNoticeModal}
    >
      <View style={styles.welcomeModalRoot}>
        <Pressable style={styles.welcomeModalBackdrop} onPress={finalizeStockAddNoticeModal} />
        <View style={styles.welcomeModalCard}>
          <View style={styles.welcomeModalAccent} />
          <Text style={styles.welcomeModalKicker}>BİLGİLENDİRME</Text>
          <Text style={styles.welcomeModalTitle}>{stockAddNotice?.title || ""}</Text>
          <ScrollView
            style={styles.welcomeModalScroll}
            contentContainerStyle={styles.welcomeModalScrollInner}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {parseNoticeMessage(stockAddNotice?.message).map((block, idx) => {
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
            onPress={() => setDontShowStockAddNoticeAgain((v) => !v)}
            activeOpacity={0.75}
            disabled={stockAddNoticeCloseLoading}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowStockAddNoticeAgain }}
          >
            <View style={[styles.welcomeCheckbox, dontShowStockAddNoticeAgain && styles.welcomeCheckboxOn]}>
              {dontShowStockAddNoticeAgain ? <Text style={styles.welcomeCheckboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.welcomeCheckboxLabel}>Bu bildirimi bir daha gösterme</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.welcomeOkBtn, stockAddNoticeCloseLoading && styles.welcomeOkBtnDisabled]}
            onPress={finalizeStockAddNoticeModal}
            disabled={stockAddNoticeCloseLoading}
            activeOpacity={0.88}
          >
            <Text style={styles.welcomeOkBtnText}>
              {stockAddNoticeCloseLoading ? "Kaydediliyor..." : "Tamam"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <PageTitleRow title="Stok Ekle" titleStyle={styles.title} />

      <Text style={styles.label}>Stok kategorisi sec</Text>
      <TouchableOpacity
        style={styles.selectBox}
        onPress={() => {
          setCategoryMessage("");
          setStockMessage("");
          setOpenPicker("category");
        }}
      >
        <Text style={category ? styles.selectValue : styles.selectPlaceholder}>
          {categoriesLoading
            ? "Kategoriler yukleniyor..."
            : category?.stock_category_name || "Kategori seciniz"}
        </Text>
        <Text style={styles.chevron}>v</Text>
      </TouchableOpacity>
      {renderPickerModal("category", categories, setCategory, "Stok kategorisi")}

      <Text style={styles.label}>Satici sec</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setOpenPicker("seller")}>
        <Text style={seller ? styles.selectValue : styles.selectPlaceholder}>
          {sellersLoading ? "Saticilar yukleniyor..." : seller?.seller_name || "Satici seciniz"}
        </Text>
        <Text style={styles.chevron}>v</Text>
      </TouchableOpacity>
      {renderPickerModal("seller", sellers, setSeller, "Satici sec")}

      <Text style={styles.label}>Stok adi giriniz</Text>
      <TextInput
        style={styles.input}
        value={stockName}
        onChangeText={setStockName}
        placeholder="Stok adi"
        placeholderTextColor="#666"
      />

      <Text style={styles.label}>Birim seciniz</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setOpenPicker("unit")}>
        <Text style={unit ? styles.selectValue : styles.selectPlaceholder}>
          {unitsLoading ? "Birimler yukleniyor..." : unit?.unit_name || "Birim seciniz"}
        </Text>
        <Text style={styles.chevron}>v</Text>
      </TouchableOpacity>
      {renderPickerModal("unit", units, setUnit, "Birim")}

      <KdvPriceInput
        label="Birim maliyeti"
        placeholder="Orn: 125,50"
        value={unitCost}
        onChangeValue={setUnitCost}
        kdvIncluded={unitCostKdvIncluded}
        onKdvIncludedChange={(v) => {
          setUnitCostKdvIncluded(v);
          if (v) setUnitCostKdvRate(null);
        }}
        selectedKdvRate={unitCostKdvRate}
        onSelectedKdvRateChange={setUnitCostKdvRate}
        inputStyle={styles.input}
      />

      <Text style={styles.label}>Stok miktari</Text>
      <TextInput
        style={styles.input}
        value={stockMiktari}
        onChangeText={setStockMiktari}
        placeholder="Stok miktarini girin"
        placeholderTextColor="#666"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Para birimi sec</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setOpenPicker("currency")}>
        <Text style={currency ? styles.selectValue : styles.selectPlaceholder}>
          {currenciesLoading
            ? "Para birimleri yukleniyor..."
            : currency
              ? `${currency.currency_name} (${currency.currency_abbreviation})`
              : "Para birimi seciniz"}
        </Text>
        <Text style={styles.chevron}>v</Text>
      </TouchableOpacity>
      {renderPickerModal("currency", currencies, setCurrency, "Para birimi")}

      {stockMessage ? <Text style={styles.categoryMessage}>{stockMessage}</Text> : null}
      <TouchableOpacity style={styles.button} onPress={onOpenStockConfirm} disabled={isSavingStock}>
        <Text style={styles.buttonText}>{isSavingStock ? "Kaydediliyor..." : "Stok Ekle"}</Text>
      </TouchableOpacity>

      <Modal
        visible={showStockConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSavingStock) closeStockConfirmModal();
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (!isSavingStock) closeStockConfirmModal();
            }}
          />
          <View style={[styles.modalSheet, styles.stockConfirmSheet]}>
            {stockConfirmStep === 1 ? (
              <>
                <Text style={styles.modalTitle}>Bilgileri onayliyor musunuz?</Text>
                <View style={styles.confirmContent}>
                  <Text style={styles.confirmRow}>Stok kategorisi: {category?.stock_category_name || "-"}</Text>
                  <Text style={styles.confirmRow}>Stok adi: {stockName || "-"}</Text>
                  <Text style={styles.confirmRow}>Birim: {unit?.unit_name || "-"}</Text>
                  <Text style={styles.confirmRow}>Birim maliyeti: {unitCost || "-"}</Text>
                  <Text style={styles.confirmRow}>Stok miktari: {stockMiktari || "-"}</Text>
                  <Text style={styles.confirmRow}>
                    Para birimi: {currency ? `${currency.currency_name} (${currency.currency_abbreviation})` : "-"}
                  </Text>
                  <Text style={styles.confirmRow}>Satici: {seller?.seller_name || "-"}</Text>
                  {(() => {
                    const tp = getStockTotalPreview();
                    return tp !== null ? (
                      <Text style={styles.confirmRowHighlight}>Toplam odenecek tutar: {tp.toLocaleString("tr-TR")}</Text>
                    ) : null;
                  })()}
                </View>
                <View style={styles.confirmActions}>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.confirmCancelButton]}
                    onPress={closeStockConfirmModal}
                    disabled={isSavingStock}
                  >
                    <Text style={styles.confirmCancelButtonText}>Iptal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.confirmApproveButton]}
                    onPress={onStockConfirmContinue}
                    disabled={isSavingStock}
                  >
                    <Text style={styles.confirmApproveButtonText}>Devam</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Odeme bilgisi</Text>
                <View style={styles.confirmContent}>
                  {(() => {
                    const tp = getStockTotalPreview();
                    return (
                      <>
                        <Text style={styles.confirmRow}>
                          Toplam tutar (miktar x birim maliyet):{" "}
                          {tp !== null ? tp.toLocaleString("tr-TR") : "-"}
                        </Text>
                        <Text style={styles.paymentQuestion}>
                          Tutarin ne kadarini odediniz? Geri kalan kisim satıcı borcu olarak Borçlar Alacaklar
                          sayfasinda listelenir.
                        </Text>
                        <TextInput
                          style={[styles.input, styles.modalPaymentInput]}
                          value={paidAmountInput}
                          onChangeText={setPaidAmountInput}
                          placeholder="Odenen tutar"
                          placeholderTextColor="#666"
                          keyboardType="decimal-pad"
                          editable={!isSavingStock}
                        />
                        {(() => {
                          const totalP = getStockTotalPreview();
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
                              Kalan {remainder.toLocaleString("tr-TR")}, {seller?.seller_name || "satici"} icin borc olarak
                              kaydedilecek. Kasadan bu stok icin sadece odenen kisim gider yazilir.
                            </Text>
                          );
                        })()}
                      </>
                    );
                  })()}
                </View>
                <View style={styles.confirmActionsThree}>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.confirmCancelButton]}
                    onPress={() => setStockConfirmStep(1)}
                    disabled={isSavingStock}
                  >
                    <Text style={styles.confirmCancelButtonText}>Geri</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.confirmApproveButton, styles.confirmSaveFlex]}
                    onPress={onSaveStock}
                    disabled={isSavingStock}
                  >
                    <Text style={styles.confirmApproveButtonText}>
                      {isSavingStock ? "Kaydediliyor..." : "Stok kaydet"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={showCategoryAddModal} transparent animationType="fade" onRequestClose={() => setShowCategoryAddModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowCategoryAddModal(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Kategori adi giriniz</Text>
            <TextInput
              style={[styles.input, styles.modalInput]}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              placeholder="Kategori adi"
              placeholderTextColor="#666"
            />
            {categoryMessage ? <Text style={styles.categoryMessage}>{categoryMessage}</Text> : null}
            <TouchableOpacity style={styles.modalActionButton} onPress={onSaveCategory}>
              <Text style={styles.modalActionButtonText}>Kaydet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showUnitAddModal} transparent animationType="fade" onRequestClose={() => setShowUnitAddModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowUnitAddModal(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Birim adi giriniz</Text>
            <TextInput
              style={[styles.input, styles.modalInput]}
              value={newUnitName}
              onChangeText={setNewUnitName}
              placeholder="Birim adi"
              placeholderTextColor="#666"
            />
            {unitMessage ? <Text style={styles.categoryMessage}>{unitMessage}</Text> : null}
            <TouchableOpacity style={styles.modalActionButton} onPress={onSaveUnit}>
              <Text style={styles.modalActionButtonText}>Birim Ekle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showSellerAddModal} transparent animationType="fade" onRequestClose={() => setShowSellerAddModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowSellerAddModal(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Satici adi gir</Text>
            <TextInput
              style={[styles.input, styles.modalInput]}
              value={newSellerName}
              onChangeText={setNewSellerName}
              placeholder="Satici adi"
              placeholderTextColor="#666"
            />
            {categoryMessage ? <Text style={styles.categoryMessage}>{categoryMessage}</Text> : null}
            <TouchableOpacity style={styles.modalActionButton} onPress={onSaveSeller}>
              <Text style={styles.modalActionButtonText}>Ekle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    {renderStockAddNoticeModal()}
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
    paddingBottom: 24
  },
  title: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 18
  },
  label: {
    color: COLORS.textLight,
    fontSize: 14,
    marginBottom: 4,
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14
  },
  selectBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14
  },
  selectPlaceholder: {
    color: "#666",
    fontSize: 15
  },
  selectValue: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "600"
  },
  chevron: {
    color: COLORS.primary,
    fontSize: 12,
    opacity: 0.8
  },
  modalRoot: {
    flex: 1,
    justifyContent: "center"
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)"
  },
  modalSheet: {
    marginHorizontal: HORIZONTAL_PADDING,
    maxHeight: "55%",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8
  },
  modalTitle: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  modalTopActionButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  modalTopActionText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700"
  },
  modalRow: {
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  modalRowText: {
    color: COLORS.primary,
    fontSize: 15
  },
  modalInput: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 10
  },
  categoryMessage: {
    color: COLORS.primary,
    fontSize: 12,
    marginHorizontal: 16,
    marginBottom: 8
  },
  modalActionButton: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 11
  },
  modalActionButtonText: {
    color: COLORS.black,
    fontWeight: "800",
    fontSize: 14
  },
  addCategoryButton: {
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 10
  },
  addCategoryButtonText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700"
  },
  confirmContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8
  },
  confirmRow: {
    color: COLORS.textLight,
    fontSize: 13
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 14
  },
  confirmButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 11
  },
  confirmCancelButton: {
    borderWidth: 1.5,
    borderColor: COLORS.primary
  },
  confirmCancelButtonText: {
    color: COLORS.primary,
    fontWeight: "700"
  },
  confirmApproveButton: {
    backgroundColor: COLORS.primary
  },
  confirmApproveButtonText: {
    color: COLORS.black,
    fontWeight: "800"
  },
  stockConfirmSheet: {
    maxHeight: "78%"
  },
  confirmRowHighlight: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4
  },
  paymentQuestion: {
    color: COLORS.textLight,
    fontSize: 13,
    marginTop: 10,
    lineHeight: 19
  },
  modalPaymentInput: {
    marginTop: 10,
    marginBottom: 4
  },
  remainderHint: {
    color: "#a8936a",
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18
  },
  confirmActionsThree: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 14,
    alignItems: "stretch"
  },
  confirmSaveFlex: {
    flex: 1.4
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6
  },
  buttonText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "800"
  },
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
