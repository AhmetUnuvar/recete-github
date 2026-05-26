import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  FlatList,
  Alert
} from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";
import { deleteStock, getStocks, setStockAlert, updateStock } from "../services/stockService";
import { exportAndShareTable } from "../services/tableMakerService";
import {
  dismissNotification,
  getPendingNotificationsForPage,
  TARGET_PAGE_MY_STOCKS
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

const TIME_FILTERS = ["Bugun", "Bu Hafta", "Bu Ay", "Bu Yil", "Ozel Aralik"];
const DEFAULT_CATEGORY_FILTER = "Tum Kategoriler";

const parseAlertThreshold = (raw) => {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
};

const isStockLow = (item) => {
  const threshold = parseAlertThreshold(item?.stock_alert);
  if (threshold === null) return false;
  const qty = Number(item?.stock_quantity);
  if (!Number.isFinite(qty)) return false;
  return qty <= threshold;
};

const parseTrDate = (value) => {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const dt = new Date(year, month - 1, day);
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt;
};

const formatTrDate = (dateObj) => {
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const y = String(dateObj.getFullYear());
  return `${d}.${m}.${y}`;
};

const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

const isWithinTimeFilter = (createdAt, filter, customStartDate, customEndDate) => {
  if (!createdAt) return true;
  const now = new Date();
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return true;

  if (filter === "Bugun") {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  if (filter === "Bu Hafta") {
    const start = new Date(now);
    const day = start.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - diffToMonday);
    return date >= start && date <= now;
  }

  if (filter === "Bu Ay") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return date >= monthStart && date <= now;
  }

  if (filter === "Bu Yil") {
    return date.getFullYear() === now.getFullYear();
  }

  if (filter === "Ozel Aralik") {
    const startDate = parseTrDate(customStartDate);
    const endDate = parseTrDate(customEndDate);
    if (!startDate || !endDate) return true;
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    return date >= startDate && date <= endDate;
  }

  return true;
};

export default function MyStocksScreen({ userId, stocksRefreshNonce = 0, myStocksFocusNonce = 0, onGoToStockAdd }) {
  const [searchText, setSearchText] = useState("");
  const [timeFilter, setTimeFilter] = useState("Bu Ay");
  const [categoryFilter, setCategoryFilter] = useState(DEFAULT_CATEGORY_FILTER);
  const [openPicker, setOpenPicker] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [stocksMessage, setStocksMessage] = useState("");
  const [categoryPickerSearch, setCategoryPickerSearch] = useState("");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [datePickerTarget, setDatePickerTarget] = useState(null); // "start" | "end" | null
  const [pickerDay, setPickerDay] = useState(1);
  const [pickerMonth, setPickerMonth] = useState(1);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [editingStock, setEditingStock] = useState(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnitCost, setEditUnitCost] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [myStocksNotice, setMyStocksNotice] = useState(null);
  const [myStocksNoticeModalOpen, setMyStocksNoticeModalOpen] = useState(false);
  const [myStocksNoticeCloseLoading, setMyStocksNoticeCloseLoading] = useState(false);
  const [dontShowMyStocksNoticeAgain, setDontShowMyStocksNoticeAgain] = useState(false);
  const [alertStock, setAlertStock] = useState(null);
  const [alertThresholdInput, setAlertThresholdInput] = useState("");
  const [savingAlert, setSavingAlert] = useState(false);

  const closePicker = () => setOpenPicker(null);
  const closeEditModal = () => {
    if (savingEdit) return;
    setEditingStock(null);
    setEditName("");
    setEditQuantity("");
    setEditUnitCost("");
  };

  const loadStocks = async () => {
    if (!userId) {
      setStocks([]);
      setStocksMessage("Kullanici bilgisi bulunamadi.");
      return;
    }
    try {
      setLoadingStocks(true);
      setStocksMessage("");
      const rows = await getStocks(userId);
      setStocks(rows);
    } catch (error) {
      setStocksMessage(error.message || "Stoklar yuklenemedi.");
    } finally {
      setLoadingStocks(false);
    }
  };

  useEffect(() => {
    loadStocks();
  }, [userId, stocksRefreshNonce]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setMyStocksNotice(null);
        setMyStocksNoticeModalOpen(false);
        return;
      }
      try {
        const list = await getPendingNotificationsForPage({
          userId,
          targetPage: TARGET_PAGE_MY_STOCKS
        });
        if (cancelled) return;
        const first = list[0];
        if (first?.id) {
          setMyStocksNotice(first);
          setMyStocksNoticeModalOpen(true);
        } else {
          setMyStocksNotice(null);
          setMyStocksNoticeModalOpen(false);
        }
      } catch (e) {
        if (__DEV__ && !cancelled) {
          console.warn("[MyStocksScreen] Bildirim yuklenemedi:", e?.message || e);
        }
        if (!cancelled) {
          setMyStocksNotice(null);
          setMyStocksNoticeModalOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, myStocksFocusNonce]);

  useEffect(() => {
    setDontShowMyStocksNoticeAgain(false);
  }, [myStocksNotice?.id]);

  const finalizeMyStocksNoticeModal = useCallback(async () => {
    if (myStocksNoticeCloseLoading || !myStocksNotice) return;
    const shouldDismiss = dontShowMyStocksNoticeAgain && userId && myStocksNotice?.id;
    try {
      if (shouldDismiss) setMyStocksNoticeCloseLoading(true);
      if (shouldDismiss) await dismissNotification({ userId, notificationId: myStocksNotice.id });
    } catch (_e) {
      /* tekrar denenebilir */
    } finally {
      setMyStocksNoticeCloseLoading(false);
      setMyStocksNoticeModalOpen(false);
      if (shouldDismiss) setMyStocksNotice(null);
    }
  }, [myStocksNoticeCloseLoading, myStocksNotice, dontShowMyStocksNoticeAgain, userId]);

  const categoryFilters = useMemo(() => {
    const categories = stocks
      .map((item) => item.stock_category_name)
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index);
    return [DEFAULT_CATEGORY_FILTER, ...categories];
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    return stocks.filter((item) => {
      const categoryOk =
        categoryFilter === DEFAULT_CATEGORY_FILTER || item.stock_category_name === categoryFilter;
      const timeOk = isWithinTimeFilter(item.created_at, timeFilter, customStartDate, customEndDate);
      const searchOk =
        !normalizedSearch || item.stock_name?.toLowerCase().includes(normalizedSearch);
      return categoryOk && timeOk && searchOk;
    });
  }, [stocks, searchText, categoryFilter, timeFilter, customStartDate, customEndDate]);

  const formatNumber = (value, fractionDigits) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return "-";
    return parsed.toFixed(fractionDigits);
  };

  const normalizeUnitProbe = (raw) =>
    String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/ı/g, "i")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c");

  /** metre/cm/kg/g ve benzeri: her zaman 2 ondalik (or. 98.80); adette tam sayiya yakin gosterim. */
  const isMetricStyleStockUnit = (unitName) => {
    const c = normalizeUnitProbe(unitName);
    if (!c || c.includes("adet") || c === "pcs" || c === "pc" || c === "tane") return false;
    if (
      c === "m" ||
      c === "mt" ||
      c === "mtr" ||
      c === "cm" ||
      c === "mm" ||
      c === "km" ||
      c === "kg" ||
      c === "g" ||
      c === "gr" ||
      c === "l" ||
      c === "lt" ||
      c === "ml"
    )
      return true;
    return (
      c.includes("metre") ||
      c.includes("meter") ||
      c.includes("santimet") ||
      c.includes("milimet") ||
      c.includes("kilomet") ||
      c.includes("kilogram") ||
      c.includes("miligram") ||
      c.includes("mililit") ||
      c === "gram" ||
      c.includes("litre") ||
      c.includes("liter")
    );
  };

  const formatQuantityDisplay = (value, unitName) => {
    const n = Number(value);
    if (Number.isNaN(n)) return "-";
    if (isMetricStyleStockUnit(unitName)) {
      return String(parseFloat((Math.round(n * 100) / 100).toFixed(2)));
    }
    const q = parseFloat(n.toFixed(3));
    if (Number.isInteger(q)) return String(q);
    return String(q);
  };

  const openEditModal = (item) => {
    setEditingStock(item);
    setEditName(String(item.stock_name || ""));
    setEditQuantity(String(item.stock_quantity ?? ""));
    setEditUnitCost(String(item.unit_cost ?? ""));
  };

  const onSaveEdit = async () => {
    if (!editingStock?.id || !userId) return;
    if (!editName.trim()) {
      Alert.alert("Uyari", "Stok adi bos olamaz.");
      return;
    }
    const qty = Number(String(editQuantity).replace(",", "."));
    const cost = Number(String(editUnitCost).replace(",", "."));
    if (Number.isNaN(qty) || qty < 0 || Number.isNaN(cost) || cost < 0) {
      Alert.alert("Uyari", "Miktar ve birim maliyeti 0 veya buyuk sayi olmali.");
      return;
    }
    try {
      setSavingEdit(true);
      await updateStock({
        userId,
        stockId: editingStock.id,
        stockName: editName.trim(),
        stockQuantity: qty,
        unitCost: cost
      });
      closeEditModal();
      await loadStocks();
      Alert.alert("Basarili", "Stok guncellendi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Stok guncellenemedi.");
    } finally {
      setSavingEdit(false);
    }
  };

  const closeAlertModal = () => {
    if (savingAlert) return;
    setAlertStock(null);
    setAlertThresholdInput("");
  };

  const openAlertModal = (item) => {
    setAlertStock(item);
    const existing = item?.stock_alert;
    setAlertThresholdInput(
      existing !== null && existing !== undefined && !Number.isNaN(Number(existing))
        ? String(existing)
        : ""
    );
  };

  const onSaveStockAlert = async () => {
    if (!alertStock?.id || !userId) return;
    const threshold = Number(String(alertThresholdInput || "").replace(",", "."));
    if (Number.isNaN(threshold) || threshold < 0) {
      Alert.alert("Uyari", "Gecerli bir uyari esigi giriniz (0 veya buyuk).");
      return;
    }
    try {
      setSavingAlert(true);
      await setStockAlert({ userId, stockId: alertStock.id, stockAlert: threshold });
      closeAlertModal();
      await loadStocks();
      Alert.alert("Basarili", "Stok uyarisi kaydedildi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Stok uyarisi kaydedilemedi.");
    } finally {
      setSavingAlert(false);
    }
  };

  const onClearStockAlert = async () => {
    if (!alertStock?.id || !userId) return;
    try {
      setSavingAlert(true);
      await setStockAlert({ userId, stockId: alertStock.id, stockAlert: null });
      closeAlertModal();
      await loadStocks();
      Alert.alert("Basarili", "Stok uyarisi kaldirildi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Stok uyarisi kaldirilamadi.");
    } finally {
      setSavingAlert(false);
    }
  };

  const onDeleteStock = (item) => {
    Alert.alert("Stok sil", `"${item.stock_name}" kaydini silmek istiyor musunuz?`, [
      { text: "Vazgec", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteStock({ userId, stockId: item.id });
            await loadStocks();
            Alert.alert("Silindi", "Stok kaydi silindi.");
          } catch (error) {
            Alert.alert("Hata", error.message || "Stok silinemedi.");
          }
        }
      }
    ]);
  };

  const exportStocksTable = async (format) => {
    try {
      setExporting(true);
      const columns = [
        { key: "stock_name", label: "Stok Adı" },
        { key: "category", label: "Kategori" },
        { key: "unit_cost", label: "Birim Maliyeti" },
        { key: "currency", label: "Para Birimi" },
        { key: "quantity", label: "Stok Miktarı" },
        { key: "unit", label: "Birim" },
        { key: "seller", label: "Satıcı Adı" }
      ];
      const rows = filteredStocks.map((item) => ({
        stock_name: item.stock_name || "-",
        category: item.stock_category_name || "-",
        unit_cost: formatNumber(item.unit_cost, 2),
        currency:
          item.currency_name && item.currency_abbreviation
            ? `${item.currency_name} (${item.currency_abbreviation})`
            : item.currency_abbreviation || "-",
        quantity: formatQuantityDisplay(item.stock_quantity, item.unit_name),
        unit: item.unit_name || "-",
        seller: item.seller_name || "-"
      }));
      await exportAndShareTable({
        title: "Stoklarım Tablosu",
        columns,
        rows,
        format
      });
    } catch (error) {
      Alert.alert("Hata", error.message || "Tablo dışa aktarılamadı.");
    } finally {
      setExporting(false);
    }
  };

  const onPressExport = () => {
    Alert.alert("Tabloyu İndir", "Format seçiniz", [
      { text: "Vazgeç", style: "cancel" },
      { text: "CSV", onPress: () => exportStocksTable("csv") },
      { text: "PNG", onPress: () => exportStocksTable("png") }
    ]);
  };

  const openDatePicker = (target) => {
    const parsed = parseTrDate(target === "start" ? customStartDate : customEndDate);
    const basis = parsed || new Date();
    setPickerDay(basis.getDate());
    setPickerMonth(basis.getMonth() + 1);
    setPickerYear(basis.getFullYear());
    setDatePickerTarget(target);
  };

  const confirmDatePicker = () => {
    const maxDay = getDaysInMonth(pickerYear, pickerMonth);
    const safeDay = Math.min(pickerDay, maxDay);
    const chosen = new Date(pickerYear, pickerMonth - 1, safeDay);
    const txt = formatTrDate(chosen);
    if (datePickerTarget === "start") {
      setCustomStartDate(txt);
    } else if (datePickerTarget === "end") {
      setCustomEndDate(txt);
    }
    setDatePickerTarget(null);
  };

  const years = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const arr = [];
    for (let y = thisYear - 10; y <= thisYear + 10; y += 1) arr.push(y);
    return arr;
  }, []);
  const months = useMemo(() => Array.from({ length: 12 }, (_v, i) => i + 1), []);
  const days = useMemo(
    () => Array.from({ length: getDaysInMonth(pickerYear, pickerMonth) }, (_v, i) => i + 1),
    [pickerYear, pickerMonth]
  );

  const renderPickerModal = (key, data, selected, onSelect, title) => {
    const listData =
      key === "category"
        ? data.filter((item) =>
            item.toLowerCase().includes(categoryPickerSearch.trim().toLowerCase())
          )
        : data;
    return (
    <Modal visible={openPicker === key} transparent animationType="fade" onRequestClose={closePicker}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={closePicker} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{title}</Text>
          {key === "category" ? (
            <TextInput
              style={styles.modalSearchInput}
              value={categoryPickerSearch}
              onChangeText={setCategoryPickerSearch}
              placeholder="Kategori ara"
              placeholderTextColor="#666"
            />
          ) : null}
          <FlatList
            data={listData}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.modalRow, selected === item && styles.modalRowActive]}
                onPress={() => {
                  onSelect(item);
                  closePicker();
                }}
              >
                <Text style={[styles.modalRowText, selected === item && styles.modalRowTextActive]}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
    );
  };

  const renderMyStocksNoticeModal = () => (
    <Modal
      visible={myStocksNoticeModalOpen && myStocksNotice != null}
      transparent
      animationType="fade"
      onRequestClose={finalizeMyStocksNoticeModal}
    >
      <View style={styles.welcomeModalRoot}>
        <Pressable style={styles.welcomeModalBackdrop} onPress={finalizeMyStocksNoticeModal} />
        <View style={styles.welcomeModalCard}>
          <View style={styles.welcomeModalAccent} />
          <Text style={styles.welcomeModalKicker}>BİLGİLENDİRME</Text>
          <Text style={styles.welcomeModalTitle}>{myStocksNotice?.title || ""}</Text>
          <ScrollView
            style={styles.welcomeModalScroll}
            contentContainerStyle={styles.welcomeModalScrollInner}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {parseNoticeMessage(myStocksNotice?.message).map((block, idx) => {
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
            onPress={() => setDontShowMyStocksNoticeAgain((v) => !v)}
            activeOpacity={0.75}
            disabled={myStocksNoticeCloseLoading}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowMyStocksNoticeAgain }}
          >
            <View style={[styles.welcomeCheckbox, dontShowMyStocksNoticeAgain && styles.welcomeCheckboxOn]}>
              {dontShowMyStocksNoticeAgain ? <Text style={styles.welcomeCheckboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.welcomeCheckboxLabel}>Bu bildirimi bir daha gösterme</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.welcomeOkBtn, myStocksNoticeCloseLoading && styles.welcomeOkBtnDisabled]}
            onPress={finalizeMyStocksNoticeModal}
            disabled={myStocksNoticeCloseLoading}
            activeOpacity={0.88}
          >
            <Text style={styles.welcomeOkBtnText}>
              {myStocksNoticeCloseLoading ? "Kaydediliyor..." : "Tamam"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.pageTitleRow}>
        <Text style={[styles.title, styles.titleInHeader]} numberOfLines={2}>
          Stoklarim
        </Text>
        <PageHeaderRightActions>
          {typeof onGoToStockAdd === "function" ? (
            <TouchableOpacity style={styles.stockAddBtn} onPress={onGoToStockAdd} activeOpacity={0.85}>
              <Text style={styles.stockAddBtnText} numberOfLines={2}>
                Stok ekle
              </Text>
            </TouchableOpacity>
          ) : null}
        </PageHeaderRightActions>
      </View>

      <View style={styles.searchBarWrap}>
        <TextInput
          style={styles.searchBarInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Stok adi ile ara"
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

      <View style={styles.filtersRow}>
        <View style={styles.filterCol}>
          <Text style={styles.label}>Zamana Gore</Text>
          <TouchableOpacity style={styles.filterSelect} onPress={() => setOpenPicker("time") }>
            <Text style={styles.filterSelectText}>{timeFilter}</Text>
            <Text style={styles.chevron}>v</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.filterCol}>
          <Text style={styles.label}>Stok Kategorisi</Text>
          <TouchableOpacity style={styles.filterSelect} onPress={() => setOpenPicker("category") }>
            <Text style={styles.filterSelectText}>{categoryFilter}</Text>
            <Text style={styles.chevron}>v</Text>
          </TouchableOpacity>
        </View>
      </View>

      {timeFilter === "Ozel Aralik" ? (
        <View style={styles.customDateWrap}>
          <View style={styles.customDateCol}>
            <Text style={styles.label}>Baslangic (GG.AA.YYYY)</Text>
            <TouchableOpacity style={styles.dateSelect} onPress={() => openDatePicker("start")}>
              <Text style={styles.dateSelectText}>{customStartDate || "Tarih sec"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.customDateCol}>
            <Text style={styles.label}>Bitis (GG.AA.YYYY)</Text>
            <TouchableOpacity style={styles.dateSelect} onPress={() => openDatePicker("end")}>
              <Text style={styles.dateSelectText}>{customEndDate || "Tarih sec"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {renderPickerModal("time", TIME_FILTERS, timeFilter, setTimeFilter, "Zaman Filtresi")}
      {renderPickerModal("category", categoryFilters, categoryFilter, (value) => {
        setCategoryFilter(value);
        setCategoryPickerSearch("");
      }, "Kategori Filtresi")}

      <View style={styles.exportRow}>
        <TouchableOpacity style={styles.exportBtn} onPress={onPressExport} disabled={exporting}>
          <Text style={styles.exportBtnText}>{exporting ? "Hazırlanıyor..." : "İndir"}</Text>
        </TouchableOpacity>
      </View>

      {stocksMessage ? <Text style={styles.infoText}>{stocksMessage}</Text> : null}
      {loadingStocks ? <Text style={styles.infoText}>Stoklar yukleniyor...</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableWrap}>
        <View>
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, styles.nameCell]}>Stok Adi</Text>
            <Text style={styles.headerCell}>Kategori</Text>
            <Text style={styles.headerCell}>Birim Maliyeti</Text>
            <Text style={styles.headerCell}>Para Birimi</Text>
            <Text style={styles.headerCell}>Stok Miktari</Text>
            <Text style={styles.headerCell}>Birim</Text>
            <Text style={styles.headerCell}>Satici Adi</Text>
            <Text style={styles.headerCell}>Islem</Text>
          </View>

          {filteredStocks.length === 0 && !loadingStocks ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>Gosterilecek stok bulunamadi.</Text>
            </View>
          ) : (
            filteredStocks.map((item) => {
              const lowStock = isStockLow(item);
              return (
              <View key={item.id} style={styles.dataRow}>
                <View style={[styles.dataCell, styles.nameCell, styles.nameCellWrap]}>
                  {lowStock ? (
                    <Text style={styles.lowStockBadge} accessibilityLabel="Stok azaliyor">
                      !
                    </Text>
                  ) : null}
                  <Text style={[styles.nameCellText, lowStock && styles.nameCellTextLow]} numberOfLines={2}>
                    {item.stock_name || "-"}
                  </Text>
                  {lowStock ? (
                    <Text style={styles.lowStockHint} numberOfLines={2}>
                      Stogunuz azaliyor
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.dataCell}>{item.stock_category_name || "-"}</Text>
                <Text style={styles.dataCell}>{formatNumber(item.unit_cost, 2)}</Text>
                <Text style={styles.dataCell}>
                  {item.currency_name && item.currency_abbreviation
                    ? `${item.currency_name} (${item.currency_abbreviation})`
                    : item.currency_abbreviation || "-"}
                </Text>
                <Text style={styles.dataCell}>{formatQuantityDisplay(item.stock_quantity, item.unit_name)}</Text>
                <Text style={styles.dataCell}>{item.unit_name || "-"}</Text>
                <Text style={styles.dataCell}>{item.seller_name || "-"}</Text>
                <View style={[styles.dataCell, styles.actionCell]}>
                  <TouchableOpacity style={styles.alertBtn} onPress={() => openAlertModal(item)}>
                    <Text style={styles.alertBtnText}>Uyari Ekle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
                    <Text style={styles.editBtnText}>Duzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => onDeleteStock(item)}>
                    <Text style={styles.deleteBtnText}>Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
            })
          )}
        </View>
      </ScrollView>

      <Modal visible={alertStock != null} transparent animationType="fade" onRequestClose={closeAlertModal}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeAlertModal} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Stok Uyarisi</Text>
            <Text style={styles.alertModalHint}>
              {alertStock?.stock_name || "Stok"} — Mevcut miktar:{" "}
              {formatQuantityDisplay(alertStock?.stock_quantity, alertStock?.unit_name)}{" "}
              {alertStock?.unit_name || ""}
            </Text>
            <Text style={styles.alertModalHint}>
              Stok miktari bu degerin altina veya esidine dustugunde kirmizi uyari gosterilir.
            </Text>
            <Text style={styles.editLabel}>Uyari esigi (miktar)</Text>
            <TextInput
              style={styles.editInput}
              value={alertThresholdInput}
              onChangeText={setAlertThresholdInput}
              placeholder="Orn: 10"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
              editable={!savingAlert}
            />
            <View style={styles.editActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeAlertModal} disabled={savingAlert}>
                <Text style={styles.cancelBtnText}>Iptal</Text>
              </TouchableOpacity>
              {alertStock?.stock_alert != null && !Number.isNaN(Number(alertStock.stock_alert)) ? (
                <TouchableOpacity
                  style={styles.clearAlertBtn}
                  onPress={onClearStockAlert}
                  disabled={savingAlert}
                >
                  <Text style={styles.clearAlertBtnText}>Kaldir</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.saveBtn} onPress={onSaveStockAlert} disabled={savingAlert}>
                <Text style={styles.saveBtnText}>{savingAlert ? "Kaydediliyor..." : "Kaydet"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editingStock != null} transparent animationType="fade" onRequestClose={closeEditModal}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeEditModal} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Stok Duzenle</Text>
            <Text style={styles.editLabel}>Stok Adi</Text>
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Stok adi"
              placeholderTextColor="#666"
            />
            <Text style={styles.editLabel}>Stok Miktari</Text>
            <TextInput
              style={styles.editInput}
              value={editQuantity}
              onChangeText={setEditQuantity}
              placeholder="Stok miktari"
              keyboardType="decimal-pad"
              placeholderTextColor="#666"
            />
            <Text style={styles.editLabel}>Birim Maliyeti</Text>
            <TextInput
              style={styles.editInput}
              value={editUnitCost}
              onChangeText={setEditUnitCost}
              placeholder="Birim maliyeti"
              keyboardType="decimal-pad"
              placeholderTextColor="#666"
            />
            <View style={styles.editActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeEditModal} disabled={savingEdit}>
                <Text style={styles.cancelBtnText}>Iptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={onSaveEdit} disabled={savingEdit}>
                <Text style={styles.saveBtnText}>{savingEdit ? "Kaydediliyor..." : "Kaydet"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={datePickerTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerTarget(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setDatePickerTarget(null)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Tarih Sec</Text>
            <View style={styles.datePickerColumns}>
              <View style={styles.dateCol}>
                <Text style={styles.label}>Gun</Text>
                <FlatList
                  data={days}
                  keyExtractor={(n) => `d-${n}`}
                  style={styles.dateList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.modalRow, pickerDay === item && styles.modalRowActive]}
                      onPress={() => setPickerDay(item)}
                    >
                      <Text style={[styles.modalRowText, pickerDay === item && styles.modalRowTextActive]}>
                        {String(item).padStart(2, "0")}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
              <View style={styles.dateCol}>
                <Text style={styles.label}>Ay</Text>
                <FlatList
                  data={months}
                  keyExtractor={(n) => `m-${n}`}
                  style={styles.dateList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.modalRow, pickerMonth === item && styles.modalRowActive]}
                      onPress={() => setPickerMonth(item)}
                    >
                      <Text style={[styles.modalRowText, pickerMonth === item && styles.modalRowTextActive]}>
                        {String(item).padStart(2, "0")}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
              <View style={styles.dateCol}>
                <Text style={styles.label}>Yil</Text>
                <FlatList
                  data={years}
                  keyExtractor={(n) => `y-${n}`}
                  style={styles.dateList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.modalRow, pickerYear === item && styles.modalRowActive]}
                      onPress={() => setPickerYear(item)}
                    >
                      <Text style={[styles.modalRowText, pickerYear === item && styles.modalRowTextActive]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
            <View style={styles.editActionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDatePickerTarget(null)}>
                <Text style={styles.cancelBtnText}>Iptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={confirmDatePicker}>
                <Text style={styles.saveBtnText}>Sec</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    {renderMyStocksNoticeModal()}
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
  pageTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
    marginBottom: 14
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
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6
  },
  searchBarWrap: {
    position: "relative",
    width: "100%",
    marginBottom: 12
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
  filtersRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14
  },
  exportRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 10
  },
  exportBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  exportBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700"
  },
  customDateWrap: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10
  },
  customDateCol: {
    flex: 1
  },
  dateSelect: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  dateSelectText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600"
  },
  filterCol: {
    flex: 1
  },
  filterSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  filterSelectText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600"
  },
  chevron: {
    color: COLORS.primary,
    fontSize: 11,
    opacity: 0.8
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    minWidth: 830
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black,
    paddingVertical: 10,
    paddingHorizontal: 6,
    minWidth: 830
  },
  headerCell: {
    width: 88,
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "left",
    paddingHorizontal: 4,
    paddingRight: 6
  },
  dataCell: {
    width: 88,
    color: COLORS.textLight,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "left",
    paddingHorizontal: 4,
    paddingRight: 6
  },
  nameCell: {
    width: 152
  },
  nameCellWrap: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2
  },
  nameCellText: {
    color: COLORS.textLight,
    fontSize: 11,
    fontWeight: "600"
  },
  nameCellTextLow: {
    color: "#ff6d6d"
  },
  lowStockBadge: {
    color: "#ffffff",
    backgroundColor: "#d9534f",
    fontWeight: "900",
    fontSize: 12,
    width: 18,
    height: 18,
    lineHeight: 18,
    textAlign: "center",
    borderRadius: 9,
    overflow: "hidden",
    marginBottom: 2
  },
  lowStockHint: {
    color: "#ff6d6d",
    fontSize: 9,
    fontWeight: "700"
  },
  actionCell: {
    width: 200,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 6
  },
  alertBtn: {
    borderWidth: 1,
    borderColor: "#e8c547",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 7
  },
  alertBtnText: {
    color: "#e8c547",
    fontSize: 10,
    fontWeight: "700"
  },
  alertModalHint: {
    color: COLORS.textLight,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8
  },
  clearAlertBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  clearAlertBtnText: {
    color: COLORS.textLight,
    fontWeight: "700"
  },
  editBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9
  },
  editBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700"
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: "#d9534f",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9
  },
  deleteBtnText: {
    color: "#d9534f",
    fontSize: 11,
    fontWeight: "700"
  },
  infoText: {
    color: COLORS.primary,
    fontSize: 12,
    marginBottom: 8
  },
  tableWrap: {
    paddingBottom: 6
  },
  emptyRow: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: "flex-start",
    minWidth: 830
  },
  emptyText: {
    color: COLORS.textLight,
    fontSize: 12,
    textAlign: "left"
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
  modalRowActive: {
    backgroundColor: "rgba(255,205,17,0.12)"
  },
  modalRowText: {
    color: COLORS.primary,
    fontSize: 14
  },
  modalRowTextActive: {
    fontWeight: "700"
  },
  modalSearchInput: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8
  },
  editInput: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 14,
    marginTop: 6
  },
  editLabel: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: "700",
    marginHorizontal: 14,
    marginTop: 10
  },
  editActionRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 14,
    marginHorizontal: 14,
    marginBottom: 10
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14
  },
  cancelBtnText: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: "700"
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14
  },
  saveBtnText: {
    color: COLORS.black,
    fontSize: 12,
    fontWeight: "800"
  },
  datePickerColumns: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 14,
    marginTop: 10
  },
  dateCol: {
    flex: 1
  },
  dateList: {
    maxHeight: 180
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
