import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert
} from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";
import { getStocks, getUnits } from "../services/stockService";
import { createProduct } from "../services/productService";
import { previewRecipeCost } from "../services/calcService";
import { getFixedRecords } from "../services/financeService";
import {
  dismissNotification,
  getPendingNotificationsForPage,
  TARGET_PAGE_ADD_PRODUCT
} from "../services/notificationService";

const roundMoney = (n) => Math.round(Number(n) * 10000) / 10000;

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

/** Aylik sabit -> saatlik: 30 gun x 24 saat (backend ile ayni). */
const CALENDAR_HOURS_PER_MONTH = 30 * 24;

export default function AddProductScreen({ userId, onGoToStockAdd, addProductFocusNonce = 0 }) {
  const [productName, setProductName] = useState("");
  const [addedMaterials, setAddedMaterials] = useState([]);
  const [showMaterialPage, setShowMaterialPage] = useState(false);
  const [stocks, setStocks] = useState([]);
  const [units, setUnits] = useState([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [stocksMessage, setStocksMessage] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [materialAmount, setMaterialAmount] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [openPicker, setOpenPicker] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [costPreviewLoading, setCostPreviewLoading] = useState(false);
  const [costPreviewTotal, setCostPreviewTotal] = useState(null);
  const [costPreviewLines, setCostPreviewLines] = useState([]);
  const [costPreviewError, setCostPreviewError] = useState("");
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [salePriceInput, setSalePriceInput] = useState("");
  const [pendingMaterialsPayload, setPendingMaterialsPayload] = useState([]);
  const [productionHoursInput, setProductionHoursInput] = useState("1");
  const [fixedRecords, setFixedRecords] = useState([]);
  const [fixedLoading, setFixedLoading] = useState(false);
  const [fixedError, setFixedError] = useState("");
  /** null = yeni malzeme; dolu ise bu key satiri guncellenir */
  const [materialEditKey, setMaterialEditKey] = useState(null);
  const [addProductNotice, setAddProductNotice] = useState(null);
  const [addProductNoticeModalOpen, setAddProductNoticeModalOpen] = useState(false);
  const [addProductNoticeCloseLoading, setAddProductNoticeCloseLoading] = useState(false);
  const [dontShowAddProductNoticeAgain, setDontShowAddProductNoticeAgain] = useState(false);

  const closePicker = () => setOpenPicker(null);

  const productionHoursParsed = useMemo(() => {
    const raw = String(productionHoursInput ?? "").trim().replace(",", ".");
    if (raw === "") return 0;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }, [productionHoursInput]);

  const { hourlyFixedExpenseTotal, fixedExpenseForProduct } = useMemo(() => {
    if (!Array.isArray(fixedRecords) || fixedRecords.length === 0) {
      return { hourlyFixedExpenseTotal: 0, fixedExpenseForProduct: 0 };
    }
    let hourly = 0;
    for (const f of fixedRecords) {
      if (f.is_fixed_income === true) continue;
      const m = Number(f.amount);
      if (!Number.isFinite(m) || m <= 0) continue;
      hourly += m / CALENDAR_HOURS_PER_MONTH;
    }
    const hourlyR = roundMoney(hourly);
    return {
      hourlyFixedExpenseTotal: hourlyR,
      fixedExpenseForProduct:
        productionHoursParsed > 0 ? roundMoney(hourlyR * productionHoursParsed) : 0
    };
  }, [fixedRecords, productionHoursParsed]);

  useEffect(() => {
    if (!userId) {
      setFixedRecords([]);
      setFixedError("");
      return;
    }
    let alive = true;
    (async () => {
      try {
        setFixedLoading(true);
        setFixedError("");
        const rows = await getFixedRecords(userId);
        if (alive) setFixedRecords(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (alive) {
          setFixedRecords([]);
          setFixedError(e.message || "Sabit giderler yuklenemedi.");
        }
      } finally {
        if (alive) setFixedLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setAddProductNotice(null);
        setAddProductNoticeModalOpen(false);
        return;
      }
      try {
        const list = await getPendingNotificationsForPage({
          userId,
          targetPage: TARGET_PAGE_ADD_PRODUCT
        });
        if (cancelled) return;
        const first = list[0];
        if (first?.id) {
          setAddProductNotice(first);
          setAddProductNoticeModalOpen(true);
        } else {
          setAddProductNotice(null);
          setAddProductNoticeModalOpen(false);
        }
      } catch (e) {
        if (__DEV__ && !cancelled) {
          console.warn("[AddProductScreen] Bildirim yuklenemedi:", e?.message || e);
        }
        if (!cancelled) {
          setAddProductNotice(null);
          setAddProductNoticeModalOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, addProductFocusNonce]);

  useEffect(() => {
    setDontShowAddProductNoticeAgain(false);
  }, [addProductNotice?.id]);

  const finalizeAddProductNoticeModal = useCallback(async () => {
    if (addProductNoticeCloseLoading || !addProductNotice) return;
    const shouldDismiss = dontShowAddProductNoticeAgain && userId && addProductNotice?.id;
    try {
      if (shouldDismiss) setAddProductNoticeCloseLoading(true);
      if (shouldDismiss) await dismissNotification({ userId, notificationId: addProductNotice.id });
    } catch (_e) {
      /* tekrar denenebilir */
    } finally {
      setAddProductNoticeCloseLoading(false);
      setAddProductNoticeModalOpen(false);
      if (shouldDismiss) setAddProductNotice(null);
    }
  }, [
    addProductNoticeCloseLoading,
    addProductNotice,
    dontShowAddProductNoticeAgain,
    userId
  ]);

  useEffect(() => {
    if (!showMaterialPage || !userId) {
      return;
    }
    const load = async () => {
      try {
        setStocksLoading(true);
        setStocksMessage("");
        const [stockRows, unitRows] = await Promise.all([getStocks(userId), getUnits(userId)]);
        setStocks(stockRows);
        setUnits(unitRows);
      } catch (error) {
        setStocksMessage(error.message || "Stoklar yuklenemedi.");
        setStocks([]);
        setUnits([]);
      } finally {
        setStocksLoading(false);
      }
    };
    load();
  }, [showMaterialPage, userId]);

  useEffect(() => {
    let alive = true;
    const loadPreview = async () => {
      if (!userId || addedMaterials.length === 0) {
        setCostPreviewTotal(null);
        setCostPreviewLines([]);
        setCostPreviewError("");
        return;
      }
      const incomplete = addedMaterials.some(
        (m) =>
          !m.stockId ||
          !m.stockUnitName ||
          m.unitCost === undefined ||
          m.unitCost === null ||
          Number(String(m.amount).replace(",", ".")) <= 0
      );
      if (incomplete) {
        setCostPreviewTotal(null);
        setCostPreviewLines([]);
        return;
      }
      try {
        setCostPreviewLoading(true);
        setCostPreviewError("");
        const result = await previewRecipeCost(addedMaterials);
        if (!alive) return;
        setCostPreviewLines(result.lines || []);
        setCostPreviewTotal(result.total_cost ?? null);
      } catch (e) {
        if (!alive) return;
        setCostPreviewLines([]);
        setCostPreviewTotal(null);
        setCostPreviewError(e.message || "Maliyet onizlemesi yapilamadi.");
      } finally {
        if (alive) setCostPreviewLoading(false);
      }
    };
    loadPreview();
    return () => {
      alive = false;
    };
  }, [addedMaterials, userId]);

  const unitLabels = useMemo(() => {
    const fromUnits = units.map((u) => u.unit_name).filter(Boolean);
    const fromStocks = stocks.map((s) => s.unit_name).filter(Boolean);
    const merged = [...fromUnits, ...fromStocks];
    return [...new Set(merged)];
  }, [units, stocks]);

  const resetMaterialDraft = () => {
    setSelectedMaterial(null);
    setMaterialAmount("");
    setSelectedUnit("");
    setMaterialEditKey(null);
  };

  const closeMaterialPage = () => {
    setShowMaterialPage(false);
    resetMaterialDraft();
  };

  const openEditMaterial = (m) => {
    setMaterialEditKey(m.key);
    const fromStocks = stocks.find((s) => String(s.id) === String(m.stockId));
    if (fromStocks) {
      setSelectedMaterial(fromStocks);
    } else {
      setSelectedMaterial({
        id: m.stockId,
        stock_name: m.stockName,
        stock_category_name: m.categoryName || null,
        unit_name: m.stockUnitName,
        unit_cost: m.unitCost,
        currency_abbreviation: m.currencyAbbreviation
      });
    }
    setMaterialAmount(String(m.amount ?? "").trim());
    setSelectedUnit(m.unit || "");
    setShowMaterialPage(true);
  };

  useEffect(() => {
    if (!showMaterialPage || !materialEditKey || stocks.length === 0) return;
    setSelectedMaterial((curr) => {
      if (!curr?.id) return curr;
      const hit = stocks.find((s) => String(s.id) === String(curr.id));
      return hit || curr;
    });
  }, [showMaterialPage, stocks, materialEditKey]);

  const onConfirmAddMaterial = () => {
    if (!selectedMaterial?.id) {
      Alert.alert("Uyari", "Once stoktan bir malzeme secin.");
      return;
    }
    if (!materialAmount.trim()) {
      Alert.alert("Uyari", "Malzeme miktari girin.");
      return;
    }
    if (!selectedUnit) {
      Alert.alert("Uyari", "Birim secin.");
      return;
    }
    const nextPayload = {
      stockId: selectedMaterial.id,
      stockName: selectedMaterial.stock_name,
      categoryName: selectedMaterial.stock_category_name,
      amount: materialAmount.trim().replace(",", "."),
      unit: selectedUnit,
      unitCost: selectedMaterial.unit_cost,
      stockUnitName: selectedMaterial.unit_name,
      currencyAbbreviation: selectedMaterial.currency_abbreviation
    };

    setAddedMaterials((prev) => {
      if (materialEditKey) {
        return prev.map((row) =>
          row.key === materialEditKey ? { ...row, ...nextPayload, key: row.key } : row
        );
      }
      return [
        ...prev,
        {
          key: `${selectedMaterial.id}-${Date.now()}`,
          ...nextPayload
        }
      ];
    });
    resetMaterialDraft();
    setShowMaterialPage(false);
  };

  const onRemoveMaterial = (key) => {
    Alert.alert("Malzemeyi kaldir", "Bu kalemi listeden cikarmak istiyor musunuz?", [
      { text: "Vazgec", style: "cancel" },
      {
        text: "Kaldir",
        style: "destructive",
        onPress: () => setAddedMaterials((prev) => prev.filter((row) => row.key !== key))
      }
    ]);
  };

  const finalizeCreateProduct = async (materialsPayload, salePrice, totalHours) => {
    try {
      setSavingProduct(true);
      await createProduct({
        userId,
        productName: productName.trim(),
        materials: materialsPayload,
        price: salePrice,
        totalHours
      });
      setShowPriceModal(false);
      setSalePriceInput("");
      setPendingMaterialsPayload([]);
      Alert.alert("Basarili", "Urun kaydedildi.", [
        {
          text: "Tamam",
          onPress: () => {
            setProductName("");
            setAddedMaterials([]);
            setProductionHoursInput("1");
          }
        }
      ]);
    } catch (error) {
      Alert.alert("Hata", error.message || "Urun kaydedilemedi.");
    } finally {
      setSavingProduct(false);
    }
  };

  const onSubmitProduct = async () => {
    if (!userId) {
      Alert.alert("Uyari", "Urun kaydetmek icin giris yapin.");
      return;
    }
    if (!productName.trim()) {
      Alert.alert("Uyari", "Urun adi girin.");
      return;
    }
    if (addedMaterials.length === 0) {
      Alert.alert("Uyari", "En az bir malzeme ekleyin.");
      return;
    }

    const materialsPayload = addedMaterials
      .map((m) => ({
        stock_id: m.stockId,
        quantity: Number(String(m.amount).replace(",", ".")),
        quantity_unit: m.unit
      }))
      .filter((row) => row.stock_id && !Number.isNaN(row.quantity) && row.quantity > 0);
    if (materialsPayload.length === 0) {
      Alert.alert("Uyari", "Her malzeme icin gecerli miktar birim girin.");
      return;
    }

    setPendingMaterialsPayload(materialsPayload);
    setSalePriceInput("");
    setShowPriceModal(true);
  };

  const renderPickerModal = (key, title, data, keyExtractor, renderLabel, onSelect) => (
    <Modal visible={openPicker === key} transparent animationType="fade" onRequestClose={closePicker}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={closePicker} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{title}</Text>
          <FlatList
            data={data}
            keyExtractor={keyExtractor}
            ListEmptyComponent={
              <Text style={styles.modalEmptyText}>
                {stocksLoading ? "Yukleniyor..." : "Liste bos."}
              </Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalRow}
                onPress={() => {
                  onSelect(item);
                  closePicker();
                }}
              >
                <Text style={styles.modalRowText}>{renderLabel(item)}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );

  const renderAddProductNoticeModal = () => (
    <Modal
      visible={addProductNoticeModalOpen && addProductNotice != null}
      transparent
      animationType="fade"
      onRequestClose={finalizeAddProductNoticeModal}
    >
      <View style={styles.welcomeModalRoot}>
        <Pressable style={styles.welcomeModalBackdrop} onPress={finalizeAddProductNoticeModal} />
        <View style={styles.welcomeModalCard}>
          <View style={styles.welcomeModalAccent} />
          <Text style={styles.welcomeModalKicker}>BİLGİLENDİRME</Text>
          <Text style={styles.welcomeModalTitle}>{addProductNotice?.title || ""}</Text>
          <ScrollView
            style={styles.welcomeModalScroll}
            contentContainerStyle={styles.welcomeModalScrollInner}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {parseNoticeMessage(addProductNotice?.message).map((block, idx) => {
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
            onPress={() => setDontShowAddProductNoticeAgain((v) => !v)}
            activeOpacity={0.75}
            disabled={addProductNoticeCloseLoading}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowAddProductNoticeAgain }}
          >
            <View style={[styles.welcomeCheckbox, dontShowAddProductNoticeAgain && styles.welcomeCheckboxOn]}>
              {dontShowAddProductNoticeAgain ? <Text style={styles.welcomeCheckboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.welcomeCheckboxLabel}>Bu bildirimi bir daha gösterme</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.welcomeOkBtn, addProductNoticeCloseLoading && styles.welcomeOkBtnDisabled]}
            onPress={finalizeAddProductNoticeModal}
            disabled={addProductNoticeCloseLoading}
            activeOpacity={0.88}
          >
            <Text style={styles.welcomeOkBtnText}>
              {addProductNoticeCloseLoading ? "Kaydediliyor..." : "Tamam"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (showMaterialPage) {
    return (
      <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.pageHeader}>
          <TouchableOpacity style={styles.backButton} onPress={closeMaterialPage}>
            <Text style={styles.backButtonText}>Geri</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{materialEditKey ? "Malzeme duzenle" : "Malzeme ekle"}</Text>
        </View>

        {!userId ? (
          <Text style={styles.warnText}>Malzeme listesi icin giris yapmaniz gerekiyor.</Text>
        ) : null}
        {stocksMessage ? <Text style={styles.warnText}>{stocksMessage}</Text> : null}

        <Text style={styles.label}>Malzeme sec</Text>
        <TouchableOpacity
          style={styles.selectBox}
          onPress={() => {
            if (!userId || stocksLoading) return;
            setOpenPicker("material");
          }}
          disabled={!userId || stocksLoading}
        >
          <Text style={selectedMaterial ? styles.selectValue : styles.selectPlaceholder}>
            {stocksLoading
              ? "Stoklar yukleniyor..."
              : selectedMaterial?.stock_name || "Stoktan malzeme seciniz"}
          </Text>
          {stocksLoading ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Text style={styles.chevron}>v</Text>
          )}
        </TouchableOpacity>
          {renderPickerModal(
          "material",
          "Malzeme Secimi (Stoklariniz)",
          stocks,
          (item) => item.id,
          (item) =>
            item.stock_category_name
              ? `${item.stock_name} (${item.stock_category_name})`
              : item.stock_name || "-",
          (item) => {
            setSelectedMaterial(item);
            if (item?.unit_name) {
              setSelectedUnit(item.unit_name);
            }
          }
        )}
        {selectedMaterial ? (
          <Text style={styles.unitCostHint}>
            Stok birim fiyati ({selectedMaterial.currency_abbreviation || "-"} /{" "}
            {selectedMaterial.unit_name || "?"} ): {selectedMaterial.unit_cost ?? "-"}
          </Text>
        ) : null}

        <Text style={styles.label}>Malzeme olcusu gir</Text>
        <View style={styles.measureRow}>
          <TextInput
            style={[styles.input, styles.measureInput]}
            value={materialAmount}
            onChangeText={setMaterialAmount}
            placeholder="Miktar"
            placeholderTextColor="#666"
            keyboardType="decimal-pad"
          />
          <TouchableOpacity style={styles.unitSelect} onPress={() => setOpenPicker("unit")}>
            <Text style={selectedUnit ? styles.selectValue : styles.selectPlaceholder}>
              {selectedUnit || "Birim"}
            </Text>
            <Text style={styles.chevron}>v</Text>
          </TouchableOpacity>
        </View>
        {renderPickerModal(
          "unit",
          "Birim Secimi",
          unitLabels,
          (item) => item,
          (item) => item,
          setSelectedUnit
        )}

        <TouchableOpacity style={styles.button} onPress={onConfirmAddMaterial}>
          <Text style={styles.buttonText}>{materialEditKey ? "Kaydet" : "Malzeme ekle"}</Text>
        </TouchableOpacity>
      </ScrollView>
      {renderAddProductNoticeModal()}
      </>
    );
  }

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, styles.titleInHeader]} numberOfLines={2}>
          Urun Ekle
        </Text>
        {typeof onGoToStockAdd === "function" ? (
          <TouchableOpacity style={styles.stockAddBtn} onPress={onGoToStockAdd} activeOpacity={0.85}>
            <Text style={styles.stockAddBtnText} numberOfLines={2}>
              Stok ekle
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.label}>Urun adi gir</Text>
      <TextInput
        style={styles.input}
        value={productName}
        onChangeText={setProductName}
        placeholder="Urun adini giriniz"
        placeholderTextColor="#666"
      />
      <Text style={styles.label}>Bu urunu uretmeniz kac saat surer?</Text>
      <Text style={styles.hintMuted}>
        0 girersen sabit gider bu receteye eklenmez. Pozitif surede: her kalem icin aylik tutar ÷{" "}
        {CALENDAR_HOURS_PER_MONTH} saat × bu sure (30 gun × 24 saat).
      </Text>
      <TextInput
        style={styles.input}
        value={productionHoursInput}
        onChangeText={setProductionHoursInput}
        placeholder="Orn: 0, 2 veya 1.5"
        placeholderTextColor="#666"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Eklenen malzemeler</Text>
      {addedMaterials.length === 0 ? (
        <Text style={styles.emptyMaterialsText}>Henuz malzeme eklenmedi. Asagidaki butonla ekleyin.</Text>
      ) : (
        <View style={styles.materialList}>
          {addedMaterials.map((m, idx) => (
            <View key={m.key} style={styles.materialLine}>
              <Text style={styles.materialLineMain}>
                {m.stockName}
                {m.categoryName ? ` (${m.categoryName})` : ""}
              </Text>
              <Text style={styles.materialLineSub}>
                {m.amount} {m.unit}{" "}
                {typeof m.unitCost !== "undefined" && m.unitCost !== null ? (
                  <Text style={styles.materialLineMuted}>
                    (birim stok birimi {m.stockUnitName || "?"} icin{" "}
                    {m.currencyAbbreviation ? `${m.currencyAbbreviation} ` : ""}
                    {m.unitCost} / {m.stockUnitName || "birim"})
                  </Text>
                ) : null}
              </Text>
              {costPreviewLines[idx]?.line_cost != null ? (
                <Text style={styles.lineCostChip}>
                  Hat maliyeti: {costPreviewLines[idx].line_cost}{" "}
                  {addedMaterials[idx]?.currencyAbbreviation || ""}
                </Text>
              ) : null}
              <View style={styles.materialLineActions}>
                <TouchableOpacity
                  style={styles.materialActionBtn}
                  onPress={() => openEditMaterial(m)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.materialActionBtnText}>Duzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.materialActionBtnDanger}
                  onPress={() => onRemoveMaterial(m.key)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.materialActionBtnDangerText}>Kaldir</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {costPreviewLoading ? (
        <Text style={styles.previewMeta}>Maliyet hesaplaniyor...</Text>
      ) : null}
      {costPreviewError ? <Text style={styles.previewError}>{costPreviewError}</Text> : null}
      {fixedError ? <Text style={styles.previewError}>{fixedError}</Text> : null}
      {fixedLoading ? (
        <Text style={styles.previewMeta}>Sabit giderler yukleniyor...</Text>
      ) : null}
      {userId && !fixedLoading ? (
        <View style={styles.fixedCostBox}>
          <Text style={styles.previewSub}>
            Saatlik sabit gider (tum sabit giderler ÷ {CALENDAR_HOURS_PER_MONTH}):{" "}
            {hourlyFixedExpenseTotal.toFixed(4)}
          </Text>
          <Text style={styles.previewSub}>
            Bu urun icin sabit gider payi ({productionHoursParsed} saat):{" "}
            {productionHoursParsed > 0 ? fixedExpenseForProduct.toFixed(2) : "0,00 (sabit gider eklenmez)"}
          </Text>
        </View>
      ) : null}
      {costPreviewTotal != null && addedMaterials.length > 0 ? (
        <View style={styles.costSummaryBox}>
          <Text style={styles.previewTotal}>
            Tahmini toplam malzeme maliyeti: {Number(costPreviewTotal).toFixed(2)}
          </Text>
          <Text style={styles.previewGrandTotal}>
            Tahmini toplam maliyet (malzeme + sabit gider):{" "}
            {(Number(costPreviewTotal) + fixedExpenseForProduct).toFixed(2)}
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.buttonOutlined}
        onPress={() => {
          setMaterialEditKey(null);
          setShowMaterialPage(true);
          setSelectedMaterial(null);
          setMaterialAmount("");
          setSelectedUnit("");
        }}
      >
        <Text style={styles.buttonOutlinedText}>Malzeme Ekle</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, savingProduct && styles.buttonDisabled]}
        onPress={onSubmitProduct}
        disabled={savingProduct}
      >
        <Text style={styles.buttonText}>{savingProduct ? "Kaydediliyor..." : "Urun Ekle"}</Text>
      </TouchableOpacity>

      <Modal visible={showPriceModal} transparent animationType="fade" onRequestClose={() => setShowPriceModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => !savingProduct && setShowPriceModal(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Satis Fiyati</Text>
            <Text style={styles.modalHelpText}>
              Urun icin satis fiyati girin. Kayitli maliyet = malzemeler + (uretim saati 0 ise sadece malzeme;
              pozitif saatte saatlik sabit gider × sure eklenir).
            </Text>
            <TextInput
              style={styles.priceInput}
              value={salePriceInput}
              onChangeText={setSalePriceInput}
              placeholder="Orn: 125.50"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
            />
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowPriceModal(false)}
                disabled={savingProduct}
              >
                <Text style={styles.cancelBtnText}>Iptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                disabled={savingProduct}
                onPress={() => {
                  const parsedPrice = Number(String(salePriceInput).replace(",", "."));
                  if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
                    Alert.alert("Uyari", "Satis fiyati gecerli bir sayi olmali (0 veya buyuk).");
                    return;
                  }
                  const parsedHours = Number(String(productionHoursInput).trim().replace(",", "."));
                  if (!Number.isFinite(parsedHours) || parsedHours < 0) {
                    Alert.alert("Uyari", "Uretim suresi saat olarak 0 veya pozitif bir sayi olmali.");
                    return;
                  }
                  finalizeCreateProduct(pendingMaterialsPayload, parsedPrice, parsedHours);
                }}
              >
                <Text style={styles.confirmBtnText}>{savingProduct ? "Kaydediliyor..." : "Kaydet"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    {renderAddProductNoticeModal()}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
    marginBottom: 18
  },
  title: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "800"
  },
  titleInHeader: { flex: 1, flexShrink: 1, marginBottom: 0 },
  stockAddBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignSelf: "flex-start",
    maxWidth: "46%"
  },
  stockAddBtnText: {
    color: COLORS.black,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  label: {
    color: COLORS.textLight,
    fontSize: 14,
    marginBottom: 7,
    fontWeight: "600"
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  backButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8
  },
  backButtonText: {
    color: COLORS.primary,
    fontWeight: "700",
    fontSize: 12
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
  measureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  measureInput: {
    flex: 1
  },
  unitSelect: {
    width: 95,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14
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
  modalRow: {
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  modalRowText: {
    color: COLORS.primary,
    fontSize: 14
  },
  modalHelpText: {
    color: COLORS.textLight,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 10
  },
  priceInput: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 12
  },
  modalActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12
  },
  cancelBtnText: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: "700"
  },
  confirmBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12
  },
  confirmBtnText: {
    color: COLORS.black,
    fontSize: 12,
    fontWeight: "800"
  },
  modalEmptyText: {
    color: COLORS.textLight,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 16,
    textAlign: "center"
  },
  warnText: {
    color: COLORS.primary,
    fontSize: 12,
    marginBottom: 10
  },
  hintMuted: {
    color: COLORS.textLight,
    fontSize: 12,
    marginTop: -10,
    marginBottom: 14,
    opacity: 0.88,
    lineHeight: 17
  },
  emptyMaterialsText: {
    color: COLORS.textLight,
    fontSize: 13,
    marginBottom: 12,
    opacity: 0.85
  },
  materialList: {
    marginBottom: 14,
    gap: 8
  },
  materialLine: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  materialLineMain: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700"
  },
  materialLineSub: {
    color: COLORS.textLight,
    fontSize: 13,
    marginTop: 4,
    fontWeight: "600"
  },
  materialLineMuted: {
    color: "#888",
    fontSize: 11,
    fontWeight: "500"
  },
  lineCostChip: {
    color: COLORS.primary,
    fontSize: 12,
    marginTop: 6,
    fontWeight: "700"
  },
  materialLineActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border
  },
  materialActionBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  materialActionBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800"
  },
  materialActionBtnDanger: {
    borderWidth: 1,
    borderColor: "#884444",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  materialActionBtnDangerText: {
    color: "#ff6b6b",
    fontSize: 13,
    fontWeight: "800"
  },
  unitCostHint: {
    color: COLORS.textLight,
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 17
  },
  previewMeta: {
    color: COLORS.textLight,
    fontSize: 12,
    marginBottom: 6
  },
  previewError: {
    color: "#ff6b6b",
    fontSize: 12,
    marginBottom: 8
  },
  previewTotal: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 6
  },
  previewGrandTotal: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4
  },
  previewSub: {
    color: COLORS.textLight,
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 18
  },
  fixedCostBox: {
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card
  },
  costSummaryBox: {
    marginBottom: 10
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
    marginBottom: 8
  },
  buttonOutlined: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
    marginBottom: 4
  },
  buttonOutlinedText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "800"
  },
  buttonText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "800"
  },
  buttonDisabled: {
    opacity: 0.65
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
