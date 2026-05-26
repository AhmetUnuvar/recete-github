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
  ActivityIndicator,
  Alert,
  RefreshControl,
  FlatList
} from "react-native";
import { COLORS } from "../constants/colors";
import PageHeaderRightActions from "../components/PageHeaderRightActions";
import { HORIZONTAL_PADDING, SCREEN_HEIGHT } from "../constants/layout";
import {
  createCustomer,
  deleteCustomer,
  getCities,
  getCustomers,
  setCustomerDoneStatus,
  updateCustomer
} from "../services/customerService";
import {
  createTransaction,
  deleteTransaction,
  getTransactionsByBuyer,
  updateTransaction
} from "../services/transactionsService";
import { exportAndShareTable } from "../services/tableMakerService";
import {
  getOwnedProducts,
  getRetails,
  sellOwnedProduct,
  sellRetail
} from "../services/productService";
import { getKdvRates } from "../services/calcService";
import KdvPriceInput from "../components/KdvPriceInput";
import { resolvePriceWithKdv } from "../utils/kdv";
import {
  dismissNotification,
  getPendingNotificationsForPage,
  TARGET_PAGE_CUSTOMERS
} from "../services/notificationService";

const isProductionCostLine = (item) =>
  Boolean(
    item &&
      !item.is_income &&
      item.product_id &&
      /uretim maliyeti/i.test(String(item.transaction_name || ""))
  );

const getCustomerTransactionDisplay = (item) => {
  const profit = Number(item?.profit_amount);
  if (item?.is_income && Number.isFinite(profit) && profit > 0) {
    return {
      typeLabel: "Kar",
      amount: profit,
      isProfit: true,
      nameSuffix: ""
    };
  }
  const amount = Number(item?.amount);
  return {
    typeLabel: item?.is_income ? "Gelir" : "Gider",
    amount: Number.isFinite(amount) ? amount : 0,
    isProfit: false,
    nameSuffix: ""
  };
};

const formatSellMoney = (v) => {
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const formatSellQty = (v) => {
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(3)));
};

const emptyForm = () => ({
  customer_name: "",
  customer_id_number: "",
  customer_phone: "",
  current_name: "",
  customer_company_name: "",
  customer_city: "",
  customer_district: "",
  customer_address: ""
});

const toTurkishTitleCase = (value) => {
  const text = String(value || "");
  if (!text) return "";
  return text
    .split(" ")
    .map((part) => {
      if (!part) return part;
      const lower = part.toLocaleLowerCase("tr-TR");
      return lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1);
    })
    .join(" ");
};

const startOfLocalDay = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
};

/** Inclusive calendar days from created_at through end (same local calendar day counts as day 1). */
const inclusiveRecipeDays = (customer) => {
  if (!customer?.created_at) return null;
  const start = startOfLocalDay(customer.created_at);
  if (!start) return null;
  const endSource = customer.is_done
    ? customer.recipe_completed_at || customer.updated_at
    : new Date().toISOString();
  const end = startOfLocalDay(endSource);
  if (!end) return null;
  const ms = end.getTime() - start.getTime();
  const diffDays = Math.floor(ms / 86400000);
  return diffDays < 0 ? 1 : diffDays + 1;
};

const buildRecipeExtras = (customer) => {
  const days = inclusiveRecipeDays(customer);
  if (days == null) return [];
  if (customer.is_done) {
    return [{ label: "Reçete tamamlama süresi", value: `${days} gün` }];
  }
  return [{ label: "Reçete süresi (devam)", value: `${days}. gün` }];
};

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

export default function CustomersScreen({
  userId,
  customersFocusNonce = 0,
  onTransactionsMutated
}) {
  const [customers, setCustomers] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [detailTransactions, setDetailTransactions] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMessage, setDetailMessage] = useState("");
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showNonStockExpenseModal, setShowNonStockExpenseModal] = useState(false);
  const [txnCustomer, setTxnCustomer] = useState(null);
  const [incomeName, setIncomeName] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [nonStockExpenseName, setNonStockExpenseName] = useState("");
  const [nonStockExpenseAmount, setNonStockExpenseAmount] = useState("");
  const [savingTxn, setSavingTxn] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDoneOnly, setShowDoneOnly] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editTxnName, setEditTxnName] = useState("");
  const [editTxnAmount, setEditTxnAmount] = useState("");
  const [savingTxnEdit, setSavingTxnEdit] = useState(false);
  const [customersNotice, setCustomersNotice] = useState(null);
  const [customersNoticeModalOpen, setCustomersNoticeModalOpen] = useState(false);
  const [customersNoticeCloseLoading, setCustomersNoticeCloseLoading] = useState(false);
  const [dontShowCustomersNoticeAgain, setDontShowCustomersNoticeAgain] = useState(false);
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [customerSellStep, setCustomerSellStep] = useState(null);
  const [customerSellListMode, setCustomerSellListMode] = useState(null);
  const [ownedSellRows, setOwnedSellRows] = useState([]);
  const [retailSellRows, setRetailSellRows] = useState([]);
  const [customerSellListLoading, setCustomerSellListLoading] = useState(false);
  const [sellOwnedTarget, setSellOwnedTarget] = useState(null);
  const [sellRetailTarget, setSellRetailTarget] = useState(null);
  const [sellQtyInput, setSellQtyInput] = useState("");
  const [sellReceivedInput, setSellReceivedInput] = useState("");
  const [ownedSellPriceInput, setOwnedSellPriceInput] = useState("");
  const [ownedSellKdvIncluded, setOwnedSellKdvIncluded] = useState(false);
  const [ownedSellKdvRate, setOwnedSellKdvRate] = useState(null);
  const [retailSellUnitInput, setRetailSellUnitInput] = useState("");
  const [retailSellKdvIncluded, setRetailSellKdvIncluded] = useState(false);
  const [retailSellKdvRate, setRetailSellKdvRate] = useState(null);
  const [kdvRates, setKdvRates] = useState([]);
  const [customerSelling, setCustomerSelling] = useState(false);

  const selectedCityName = useMemo(() => {
    if (!form.customer_city) return "";
    const hit = cities.find((c) => String(c.id) === String(form.customer_city));
    return hit?.city_name || "";
  }, [cities, form.customer_city]);

  const loadCities = useCallback(async () => {
    try {
      setCitiesLoading(true);
      const rows = await getCities();
      setCities(rows);
    } catch (error) {
      setCities([]);
      Alert.alert("Hata", error.message || "Şehirler yüklenemedi.");
    } finally {
      setCitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    loadCities();
  }, [modalOpen, loadCities]);

  const load = useCallback(async () => {
    if (!userId) {
      setCustomers([]);
      setMessage("Giriş yapılmamış.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      const rows = await getCustomers(userId, { isDone: showDoneOnly });
      setCustomers(rows);
    } catch (error) {
      setCustomers([]);
      setMessage(error.message || "Müşteriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [userId, showDoneOnly]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setCustomersNotice(null);
        setCustomersNoticeModalOpen(false);
        return;
      }
      try {
        const list = await getPendingNotificationsForPage({
          userId,
          targetPage: TARGET_PAGE_CUSTOMERS
        });
        if (cancelled) return;
        const first = list[0];
        if (first?.id) {
          setCustomersNotice(first);
          setCustomersNoticeModalOpen(true);
        } else {
          setCustomersNotice(null);
          setCustomersNoticeModalOpen(false);
        }
      } catch (e) {
        if (__DEV__ && !cancelled) {
          console.warn("[CustomersScreen] Bildirim yuklenemedi:", e?.message || e);
        }
        if (!cancelled) {
          setCustomersNotice(null);
          setCustomersNoticeModalOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, customersFocusNonce]);

  useEffect(() => {
    setDontShowCustomersNoticeAgain(false);
  }, [customersNotice?.id]);

  const finalizeCustomersNoticeModal = useCallback(async () => {
    if (customersNoticeCloseLoading || !customersNotice) return;
    const shouldDismiss = dontShowCustomersNoticeAgain && userId && customersNotice?.id;
    try {
      if (shouldDismiss) setCustomersNoticeCloseLoading(true);
      if (shouldDismiss) await dismissNotification({ userId, notificationId: customersNotice.id });
    } catch (_e) {
      /* tekrar denenebilir */
    } finally {
      setCustomersNoticeCloseLoading(false);
      setCustomersNoticeModalOpen(false);
      if (shouldDismiss) setCustomersNotice(null);
    }
  }, [
    customersNoticeCloseLoading,
    customersNotice,
    dontShowCustomersNoticeAgain,
    userId
  ]);

  const onRefresh = useCallback(async () => {
    if (!userId) return;
    try {
      setRefreshing(true);
      const rows = await getCustomers(userId, { isDone: showDoneOnly });
      setCustomers(rows);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Sayfa yenilenemedi.");
    } finally {
      setRefreshing(false);
    }
  }, [userId, showDoneOnly]);

  const loadCustomerTransactions = useCallback(
    async (customerId) => {
      if (!userId || !customerId) return;
      try {
        setDetailLoading(true);
        setDetailMessage("");
        const txRows = await getTransactionsByBuyer(userId, customerId, 1000);
        setDetailTransactions(txRows);
      } catch (error) {
        setDetailTransactions([]);
        setDetailMessage(error.message || "Musteri islemleri yuklenemedi.");
      } finally {
        setDetailLoading(false);
      }
    },
    [userId]
  );

  const openModal = () => {
    setEditingCustomer(null);
    setForm(emptyForm());
    setCityPickerOpen(false);
    setModalOpen(true);
  };

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setCityPickerOpen(false);
    setForm({
      customer_name: customer.customer_name || "",
      customer_id_number: customer.customer_id_number || "",
      customer_phone: customer.customer_phone || "",
      current_name: customer.current_name || "",
      customer_company_name: customer.customer_company_name || "",
      customer_city: customer.customer_city || "",
      customer_district: customer.customer_district || "",
      customer_address: customer.customer_address || ""
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setCityPickerOpen(false);
    setModalOpen(false);
  };

  const closeCityPicker = () => {
    setCityPickerOpen(false);
  };

  const onSave = async () => {
    if (!userId) {
      Alert.alert("Uyarı", "Oturum bulunamadı.");
      return;
    }
    const name = toTurkishTitleCase(form.customer_name).trim();
    if (!name) {
      Alert.alert("Uyarı", "Müşteri adı zorunludur.");
      return;
    }
    if (!String(form.customer_city || "").trim()) {
      Alert.alert("Uyarı", "Müşteri ili seçiniz.");
      return;
    }
    try {
      setSaving(true);
      const payload = {
        customer_name: name,
        customer_id_number: form.customer_id_number,
        customer_phone: form.customer_phone,
        current_name: form.current_name,
        customer_company_name: form.customer_company_name,
        customer_city: form.customer_city,
        customer_district: form.customer_district,
        customer_address: form.customer_address
      };
      if (editingCustomer?.id) {
        await updateCustomer(userId, editingCustomer.id, payload);
      } else {
        await createCustomer(userId, payload);
      }
      setModalOpen(false);
      setEditingCustomer(null);
      setForm(emptyForm());
      await load();
      Alert.alert("Başarılı", editingCustomer ? "Müşteri güncellendi." : "Müşteri kaydedildi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Kayıt başarısız.");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteCustomer = (customer) => {
    Alert.alert("Müşteri Sil", `"${customer.customer_name}" kaydını silmek istiyor musunuz?`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteCustomer(userId, customer.id);
            await load();
            Alert.alert("Silindi", "Müşteri kaydı silindi.");
          } catch (error) {
            Alert.alert("Hata", error.message || "Müşteri silinemedi.");
          }
        }
      }
    ]);
  };

  const onMarkDone = async (customer) => {
    if (!customer?.id || !userId) return;
    try {
      const updated = await setCustomerDoneStatus({
        userId,
        customerId: customer.id,
        isDone: true
      });
      setDetailCustomer((prev) =>
        prev && prev.id === customer.id ? { ...prev, ...updated } : prev
      );
      await load();
      Alert.alert("Başarılı", "Müşteri tamamlandı olarak işaretlendi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Müşteri tamamlanamadı.");
    }
  };

  const openCustomerDetail = (customer) => {
    setDetailCustomer(customer);
    loadCustomerTransactions(customer.id);
  };

  const closeDetail = () => {
    if (savingTxn || customerSelling) return;
    closeCustomerSellFlow();
    setDetailCustomer(null);
    setDetailTransactions([]);
    setDetailMessage("");
  };

  const closeCustomerSellFlow = () => {
    if (customerSelling) return;
    setCustomerSellStep(null);
    setCustomerSellListMode(null);
    setOwnedSellRows([]);
    setRetailSellRows([]);
    setSellOwnedTarget(null);
    setSellRetailTarget(null);
    setSellQtyInput("");
    setSellReceivedInput("");
    setOwnedSellPriceInput("");
    setOwnedSellKdvIncluded(false);
    setOwnedSellKdvRate(null);
    setRetailSellUnitInput("");
    setRetailSellKdvIncluded(false);
    setRetailSellKdvRate(null);
  };

  const openCustomerSellFlow = async () => {
    if (!detailCustomer?.id || !userId) return;
    try {
      const rows = await getKdvRates();
      setKdvRates(rows);
    } catch {
      setKdvRates([]);
    }
    setCustomerSellStep("type");
  };

  const pickCustomerSellType = async (mode) => {
    if (!userId) return;
    setCustomerSellListMode(mode);
    setCustomerSellStep("list");
    setCustomerSellListLoading(true);
    try {
      if (mode === "owned") {
        const data = await getOwnedProducts(userId);
        setOwnedSellRows((Array.isArray(data) ? data : []).filter((r) => (Number(r.adet) || 0) > 0));
        setRetailSellRows([]);
      } else {
        const data = await getRetails(userId);
        setRetailSellRows(
          (Array.isArray(data) ? data : []).filter((r) => (Number(r.retail_quantity) || 0) > 0)
        );
        setOwnedSellRows([]);
      }
    } catch (error) {
      Alert.alert("Hata", error.message || "Urunler yuklenemedi.");
      closeCustomerSellFlow();
    } finally {
      setCustomerSellListLoading(false);
    }
  };

  const getOwnedSalePricePreview = () => {
    const resolved = resolvePriceWithKdv(ownedSellPriceInput, ownedSellKdvIncluded, ownedSellKdvRate);
    return resolved.ok ? resolved.final : null;
  };

  const getRetailSaleTotalPreview = () => {
    if (!sellRetailTarget) return null;
    const unitResolved = resolvePriceWithKdv(
      retailSellUnitInput,
      retailSellKdvIncluded,
      retailSellKdvRate
    );
    const qty = Number(String(sellQtyInput || "").replace(",", "."));
    if (!unitResolved.ok || Number.isNaN(qty) || qty <= 0) return null;
    return Math.round(unitResolved.final * qty * 10000) / 10000;
  };

  const startOwnedSellForCustomer = (item) => {
    if (!item?.product_id) return;
    const price = Number(item.price);
    setSellOwnedTarget(item);
    setOwnedSellPriceInput(Number.isFinite(price) && price > 0 ? String(price) : "");
    setOwnedSellKdvIncluded(true);
    setOwnedSellKdvRate(null);
    setSellReceivedInput("");
    setCustomerSellStep("owned-price");
  };

  const startRetailSellForCustomer = (item) => {
    if (!item?.id) return;
    const qty = Number(item.retail_quantity);
    if (!(qty > 0)) {
      Alert.alert("Uyari", "Bu urun icin satilabilir miktar kalmadi.");
      return;
    }
    const unit = Number(item.retail_price);
    setSellRetailTarget(item);
    setSellQtyInput("");
    setRetailSellUnitInput(Number.isFinite(unit) && unit > 0 ? String(unit) : "");
    setRetailSellKdvIncluded(true);
    setRetailSellKdvRate(null);
    setSellReceivedInput("");
    setCustomerSellStep("retail-qty");
  };

  const onCustomerOwnedPriceContinue = () => {
    const resolved = resolvePriceWithKdv(ownedSellPriceInput, ownedSellKdvIncluded, ownedSellKdvRate);
    if (!resolved.ok) {
      Alert.alert("Uyari", resolved.message || "Satis fiyatini kontrol edin.");
      return;
    }
    setSellReceivedInput(String(Math.round(resolved.final * 10000) / 10000));
    setCustomerSellStep("owned-payment");
  };

  const onCustomerRetailQtyContinue = () => {
    const qty = Number(String(sellQtyInput || "").replace(",", "."));
    const maxQty = Number(sellRetailTarget?.retail_quantity) || 0;
    if (Number.isNaN(qty) || qty <= 0) {
      Alert.alert("Uyari", "Gecerli bir satis miktari giriniz.");
      return;
    }
    if (qty > maxQty + 1e-9) {
      Alert.alert("Uyari", `En fazla ${formatSellQty(maxQty)} adet satabilirsiniz.`);
      return;
    }
    setCustomerSellStep("retail-price");
  };

  const onCustomerRetailPriceContinue = () => {
    const unitResolved = resolvePriceWithKdv(
      retailSellUnitInput,
      retailSellKdvIncluded,
      retailSellKdvRate
    );
    if (!unitResolved.ok) {
      Alert.alert("Uyari", unitResolved.message || "Birim satis fiyatini kontrol edin.");
      return;
    }
    const total = getRetailSaleTotalPreview();
    if (total === null || total <= 0) {
      Alert.alert("Uyari", "Satis tutari hesaplanamadi.");
      return;
    }
    setSellReceivedInput(String(total));
    setCustomerSellStep("retail-payment");
  };

  const afterCustomerSellSuccess = async () => {
    const customerId = detailCustomer?.id;
    closeCustomerSellFlow();
    if (customerId) {
      await loadCustomerTransactions(customerId);
    }
    if (typeof onTransactionsMutated === "function") {
      onTransactionsMutated();
    }
  };

  const confirmOwnedSellForCustomer = async () => {
    if (!userId || !detailCustomer?.id || !sellOwnedTarget?.product_id) return;
    const totalPrev = getOwnedSalePricePreview();
    if (totalPrev === null || totalPrev <= 0) {
      Alert.alert("Uyari", "Satis fiyati okunamadi.");
      return;
    }
    const recv = Number(String(sellReceivedInput || "").replace(",", "."));
    if (Number.isNaN(recv) || recv < 0) {
      Alert.alert("Uyari", "Tahsil ettiginiz tutar gecerli bir sayi olmalidir.");
      return;
    }
    if (recv > totalPrev + 1e-6) {
      Alert.alert("Uyari", "Tahsil ettiginiz tutar satis fiyatindan buyuk olamaz.");
      return;
    }
    try {
      setCustomerSelling(true);
      await sellOwnedProduct({
        userId,
        productId: sellOwnedTarget.product_id,
        buyerId: detailCustomer.id,
        sale_price: totalPrev,
        received_amount: recv
      });
      await afterCustomerSellSuccess();
      Alert.alert("Basarili", "Urun satildi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Satis islemi basarisiz.");
    } finally {
      setCustomerSelling(false);
    }
  };

  const confirmRetailSellForCustomer = async () => {
    if (!userId || !detailCustomer?.id || !sellRetailTarget?.id) return;
    const qty = Number(String(sellQtyInput || "").replace(",", "."));
    const maxQty = Number(sellRetailTarget.retail_quantity) || 0;
    const totalPrev = getRetailSaleTotalPreview();
    if (Number.isNaN(qty) || qty <= 0) {
      Alert.alert("Uyari", "Gecerli bir satis miktari giriniz.");
      return;
    }
    if (qty > maxQty + 1e-9) {
      Alert.alert("Uyari", `En fazla ${formatSellQty(maxQty)} adet satabilirsiniz.`);
      return;
    }
    const unitResolved = resolvePriceWithKdv(
      retailSellUnitInput,
      retailSellKdvIncluded,
      retailSellKdvRate
    );
    if (!unitResolved.ok) {
      Alert.alert("Uyari", unitResolved.message || "Birim satis fiyatini kontrol edin.");
      return;
    }
    if (totalPrev === null || totalPrev <= 0) {
      Alert.alert("Uyari", "Satis tutari hesaplanamadi.");
      return;
    }
    const recv = Number(String(sellReceivedInput || "").replace(",", "."));
    if (Number.isNaN(recv) || recv < 0) {
      Alert.alert("Uyari", "Tahsil ettiginiz tutar gecerli bir sayi olmalidir.");
      return;
    }
    if (recv > totalPrev + 1e-6) {
      Alert.alert("Uyari", "Tahsil ettiginiz tutar satis tutarindan buyuk olamaz.");
      return;
    }
    try {
      setCustomerSelling(true);
      await sellRetail({
        userId,
        retailId: sellRetailTarget.id,
        buyerId: detailCustomer.id,
        quantitySold: qty,
        unit_sale_price: unitResolved.final,
        received_amount: recv
      });
      await afterCustomerSellSuccess();
      Alert.alert("Basarili", "Perakende satis kaydedildi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Satis islemi basarisiz.");
    } finally {
      setCustomerSelling(false);
    }
  };

  const exportCustomerTransactions = async (format, targetCustomer, transactions) => {
    if (!targetCustomer) return;
    try {
      setExporting(true);
      const columns = [
        { key: "transaction_name", label: "İşlem Adı" },
        { key: "type", label: "Tür" },
        { key: "amount", label: "Tutar" },
        { key: "date", label: "Tarih" }
      ];
      const rows = (transactions || [])
        .filter((item) => !isProductionCostLine(item))
        .map((item) => {
          const display = getCustomerTransactionDisplay(item);
          const dt = new Date(item.transaction_time || item.created_at);
          return {
            transaction_name: item.product_name
              ? `Ürün Satışı: ${item.product_name}`
              : item.transaction_name || display.typeLabel,
            type: display.typeLabel,
            amount: Number.isFinite(display.amount)
              ? `${display.isProfit || item.is_income ? "+" : "-"}${display.amount.toLocaleString("tr-TR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2
                })}`
              : "-",
            date: Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("tr-TR")
          };
        });
      await exportAndShareTable({
        title: `${targetCustomer.customer_name || "Müşteri"} İşlem Tablosu`,
        columns,
        rows,
        format,
        extras: buildRecipeExtras(targetCustomer)
      });
    } catch (error) {
      Alert.alert("Hata", error.message || "Tablo dışa aktarılamadı.");
    } finally {
      setExporting(false);
    }
  };

  const onPressExport = () => {
    const targetCustomer = detailCustomer;
    const snapshotRows = [...sortedDetailTransactions];
    if (!targetCustomer) return;
    Alert.alert("Tabloyu İndir", "Format seçiniz", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "CSV",
        onPress: () => exportCustomerTransactions("csv", targetCustomer, snapshotRows)
      },
      {
        text: "PNG",
        onPress: () => exportCustomerTransactions("png", targetCustomer, snapshotRows)
      }
    ]);
  };

  const cell = (v) => (v != null && String(v).trim() !== "" ? String(v) : "-");
  const q = searchText.trim().toLocaleLowerCase("tr-TR");
  const filteredCustomers = q
    ? customers.filter((c) =>
        [
          c.customer_name,
          c.customer_phone,
          c.customer_id_number,
          c.current_name,
          c.customer_company_name,
          c.customer_city_name,
          c.customer_district,
          c.customer_address
        ]
          .filter(Boolean)
          .some((v) => String(v).toLocaleLowerCase("tr-TR").includes(q))
      )
    : customers;

  const sortedDetailTransactions = useMemo(
    () =>
      [...detailTransactions].sort(
        (a, b) => new Date(b.transaction_time || b.created_at) - new Date(a.transaction_time || a.created_at)
      ),
    [detailTransactions]
  );

  const visibleDetailTransactions = useMemo(
    () => sortedDetailTransactions.filter((item) => !isProductionCostLine(item)),
    [sortedDetailTransactions]
  );

  const detailNetAmount = useMemo(
    () =>
      visibleDetailTransactions.reduce((sum, item) => {
        const display = getCustomerTransactionDisplay(item);
        if (!Number.isFinite(display.amount)) return sum;
        if (display.isProfit || item.is_income) return sum + display.amount;
        return sum - display.amount;
      }, 0),
    [visibleDetailTransactions]
  );

  const detailRecipeDayCount =
    detailCustomer != null ? inclusiveRecipeDays(detailCustomer) : null;

  const submitIncome = async () => {
    const targetCustomer = txnCustomer || detailCustomer;
    const customerId = targetCustomer?.id;
    const amount = Number(String(incomeAmount || "").replace(",", "."));
    const name = String(incomeName || "").trim();
    if (Number.isNaN(amount) || amount <= 0 || !customerId || !name) {
      Alert.alert("Uyari", "Gelir adi ve gecerli bir gelir tutari giriniz.");
      return;
    }
    try {
      setSavingTxn(true);
      await createTransaction({
        userId,
        amount,
        isIncome: true,
        buyerId: customerId,
        transactionName: name
      });
      setShowIncomeModal(false);
      setIncomeAmount("");
      setIncomeName("");
      setTxnCustomer(null);
      setDetailCustomer(targetCustomer || null);
      if (customerId) await loadCustomerTransactions(customerId);
      Alert.alert("Basarili", "Gelir eklendi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Gelir eklenemedi.");
    } finally {
      setSavingTxn(false);
    }
  };

  const submitNonStockExpense = async () => {
    const targetCustomer = txnCustomer || detailCustomer;
    const customerId = targetCustomer?.id;
    const amount = Number(String(nonStockExpenseAmount || "").replace(",", "."));
    const name = String(nonStockExpenseName || "").trim();
    if (!customerId || Number.isNaN(amount) || amount <= 0 || !name) {
      Alert.alert("Uyari", "Gider adi ve gecerli gider tutari giriniz.");
      return;
    }
    try {
      setSavingTxn(true);
      await createTransaction({
        userId,
        amount,
        isIncome: false,
        buyerId: customerId,
        transactionName: name
      });
      setShowNonStockExpenseModal(false);
      setNonStockExpenseAmount("");
      setNonStockExpenseName("");
      setTxnCustomer(null);
      setDetailCustomer(targetCustomer || null);
      if (customerId) await loadCustomerTransactions(customerId);
      Alert.alert("Basarili", "Stok disi gider eklendi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Gider eklenemedi.");
    } finally {
      setSavingTxn(false);
    }
  };

  const openEditTransactionModal = (item) => {
    const activeCustomer = detailCustomer || txnCustomer || null;
    if (activeCustomer) {
      setTxnCustomer(activeCustomer);
      setDetailCustomer(null);
    }
    setEditingTransaction(item);
    setEditTxnName(String(item.transaction_name || ""));
    const parsedAmount = Number(item.amount);
    setEditTxnAmount(Number.isNaN(parsedAmount) ? String(item.amount ?? "") : String(parsedAmount));
  };

  const closeEditTransactionModal = () => {
    if (savingTxnEdit) return;
    setEditingTransaction(null);
    setEditTxnName("");
    setEditTxnAmount("");
  };

  const onSaveTransactionEdit = async () => {
    const targetCustomer = txnCustomer || detailCustomer;
    const customerId = targetCustomer?.id;
    if (!editingTransaction?.id || !customerId) return;
    const amount = Number(String(editTxnAmount || "").replace(",", "."));
    if (Number.isNaN(amount) || amount <= 0) {
      Alert.alert("Uyarı", "Tutar sıfırdan büyük olmalı.");
      return;
    }
    try {
      setSavingTxnEdit(true);
      await updateTransaction({
        userId,
        transactionId: editingTransaction.id,
        amount,
        transactionName: editTxnName
      });
      closeEditTransactionModal();
      setDetailCustomer(targetCustomer || null);
      await loadCustomerTransactions(customerId);
      Alert.alert("Başarılı", "İşlem güncellendi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "İşlem güncellenemedi.");
    } finally {
      setSavingTxnEdit(false);
    }
  };

  const onDeleteTransaction = (item) => {
    const targetCustomer = txnCustomer || detailCustomer;
    const customerId = targetCustomer?.id;
    if (!item?.id || !customerId) return;
    Alert.alert("İşlemi Sil", "Bu işlemi silmek istiyor musunuz?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTransaction({ userId, transactionId: item.id });
            setDetailCustomer(targetCustomer || null);
            await loadCustomerTransactions(customerId);
            Alert.alert("Silindi", "İşlem silindi.");
          } catch (error) {
            Alert.alert("Hata", error.message || "İşlem silinemedi.");
          }
        }
      }
    ]);
  };

  const tableMinWidth = 1320;

  const renderCustomersNoticeModal = () => (
    <Modal
      visible={customersNoticeModalOpen && customersNotice != null}
      transparent
      animationType="fade"
      onRequestClose={finalizeCustomersNoticeModal}
    >
      <View style={styles.welcomeModalRoot}>
        <Pressable style={styles.welcomeModalBackdrop} onPress={finalizeCustomersNoticeModal} />
        <View style={styles.welcomeModalCard}>
          <View style={styles.welcomeModalAccent} />
          <Text style={styles.welcomeModalKicker}>BİLGİLENDİRME</Text>
          <Text style={styles.welcomeModalTitle}>{customersNotice?.title || ""}</Text>
          <ScrollView
            style={styles.welcomeModalScroll}
            contentContainerStyle={styles.welcomeModalScrollInner}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {parseNoticeMessage(customersNotice?.message).map((block, idx) => {
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
            onPress={() => setDontShowCustomersNoticeAgain((v) => !v)}
            activeOpacity={0.75}
            disabled={customersNoticeCloseLoading}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowCustomersNoticeAgain }}
          >
            <View style={[styles.welcomeCheckbox, dontShowCustomersNoticeAgain && styles.welcomeCheckboxOn]}>
              {dontShowCustomersNoticeAgain ? <Text style={styles.welcomeCheckboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.welcomeCheckboxLabel}>Bu bildirimi bir daha gösterme</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.welcomeOkBtn, customersNoticeCloseLoading && styles.welcomeOkBtnDisabled]}
            onPress={finalizeCustomersNoticeModal}
            disabled={customersNoticeCloseLoading}
            activeOpacity={0.88}
          >
            <Text style={styles.welcomeOkBtnText}>
              {customersNoticeCloseLoading ? "Kaydediliyor..." : "Tamam"}
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
      contentContainerStyle={styles.outerContent}
      refreshControl={
        userId ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        ) : undefined
      }
    >
      <View style={styles.topRow}>
        <Text style={[styles.title, styles.titleInTopRow]}>Müşteriler</Text>
        <PageHeaderRightActions>
          <TouchableOpacity style={styles.addBtn} onPress={openModal} disabled={!userId}>
            <Text style={styles.addBtnText}>Müşteri Ekle</Text>
          </TouchableOpacity>
        </PageHeaderRightActions>
      </View>

      <TextInput
        style={styles.searchInput}
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Müşteri adı, telefon, TC, il, ilçe, cari veya şirket ile ara"
        placeholderTextColor="#666"
      />
      <View style={styles.quickFilterRow}>
        <TouchableOpacity
          style={[styles.quickFilterBtn, !showDoneOnly && styles.quickFilterBtnActive]}
          onPress={() => setShowDoneOnly(false)}
        >
          <Text style={[styles.quickFilterBtnText, !showDoneOnly && styles.quickFilterBtnTextActive]}>
            Aktif Müşteriler
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickFilterBtn, showDoneOnly && styles.quickFilterBtnActive]}
          onPress={() => setShowDoneOnly(true)}
        >
          <Text style={[styles.quickFilterBtnText, showDoneOnly && styles.quickFilterBtnTextActive]}>
            Tamamlanan Müşteriler
          </Text>
        </TouchableOpacity>
      </View>

      {!userId ? <Text style={styles.infoText}>{message || "Giriş yapın."}</Text> : null}
      {userId && message ? <Text style={styles.infoText}>{message}</Text> : null}
      {userId && loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader} />
      ) : null}

      {userId ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableWrap}>
          <View style={{ minWidth: tableMinWidth }}>
            <View style={styles.headerRow}>
              <Text style={[styles.headerCell, styles.colName]}>Müşteri Adı</Text>
              <Text style={styles.headerCell}>TC</Text>
              <Text style={styles.headerCell}>Telefon</Text>
              <Text style={[styles.headerCell, styles.colCari]}>Cari Adı</Text>
              <Text style={[styles.headerCell, styles.colCompany]}>Şirket Adı</Text>
              <Text style={[styles.headerCell, styles.colCity]}>Şehir</Text>
              <Text style={[styles.headerCell, styles.colDistrict]}>İlçe</Text>
              <Text style={styles.headerCell}>Durum</Text>
              <Text style={[styles.headerCell, styles.colAction]}>İşlem</Text>
            </View>

            {filteredCustomers.length === 0 && !loading ? (
              <View style={[styles.emptyRow, { minWidth: tableMinWidth }]}>
                <Text style={styles.emptyText}>Henüz müşteri kaydı yok.</Text>
              </View>
            ) : (
              filteredCustomers.map((row) => (
                <TouchableOpacity key={row.id} style={styles.dataRow} onPress={() => openCustomerDetail(row)}>
                  <Text style={[styles.dataCell, styles.colName]} numberOfLines={2}>
                    {cell(row.customer_name)}
                  </Text>
                  <Text style={styles.dataCell} numberOfLines={2}>
                    {cell(row.customer_id_number)}
                  </Text>
                  <Text style={styles.dataCell} numberOfLines={2}>
                    {cell(row.customer_phone)}
                  </Text>
                  <Text style={[styles.dataCell, styles.colCari]} numberOfLines={2}>
                    {cell(row.current_name)}
                  </Text>
                  <Text style={[styles.dataCell, styles.colCompany]} numberOfLines={2}>
                    {cell(row.customer_company_name)}
                  </Text>
                  <Text style={[styles.dataCell, styles.colCity]} numberOfLines={2}>
                    {cell(row.customer_city_name)}
                  </Text>
                  <Text style={[styles.dataCell, styles.colDistrict]} numberOfLines={2}>
                    {cell(row.customer_district)}
                  </Text>
                  <Text style={styles.dataCell}>{row.is_done ? "Tamamlandı" : "Aktif"}</Text>
                  <View style={[styles.dataCell, styles.colAction, styles.actionCell]}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        openEditModal(row);
                      }}
                    >
                      <Text style={styles.editBtnText}>Düzenle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        onDeleteCustomer(row);
                      }}
                    >
                      <Text style={styles.deleteBtnText}>Sil</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      ) : null}

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (cityPickerOpen) {
            closeCityPicker();
            return;
          }
          closeModal();
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => {
              if (cityPickerOpen) {
                closeCityPicker();
                return;
              }
              closeModal();
            }}
          />
          <View style={styles.modalSheet}>
            {cityPickerOpen ? (
              <>
                <View style={styles.cityPickerHeader}>
                  <TouchableOpacity style={styles.cityPickerBackBtn} onPress={closeCityPicker}>
                    <Text style={styles.cityPickerBackText}>Geri</Text>
                  </TouchableOpacity>
                  <Text style={[styles.modalTitle, styles.cityPickerTitle]}>İl Seçiniz</Text>
                </View>
                <FlatList
                  style={styles.cityPickerList}
                  data={cities}
                  keyExtractor={(item) => String(item.id)}
                  keyboardShouldPersistTaps="handled"
                  ListEmptyComponent={
                    <Text style={styles.cityPickerEmpty}>
                      {citiesLoading ? "Yükleniyor..." : "Şehir listesi boş."}
                    </Text>
                  }
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.cityPickerRow}
                      onPress={() => {
                        setForm((p) => ({ ...p, customer_city: item.id }));
                        closeCityPicker();
                      }}
                    >
                      <Text style={styles.cityPickerRowText}>{item.city_name}</Text>
                    </TouchableOpacity>
                  )}
                />
              </>
            ) : (
              <>
            <Text style={styles.modalTitle}>{editingCustomer ? "Müşteri Düzenle" : "Müşteri Ekle"}</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Müşteri Adı Giriniz :</Text>
              <TextInput
                style={styles.input}
                value={form.customer_name}
                onChangeText={(t) =>
                  setForm((p) => ({ ...p, customer_name: toTurkishTitleCase(t) }))
                }
                placeholder="Müşteri adı"
                placeholderTextColor="#666"
                autoCapitalize="words"
              />
              <Text style={styles.fieldLabel}>Müşteri TC Giriniz :</Text>
              <TextInput
                style={styles.input}
                value={form.customer_id_number}
                onChangeText={(t) => setForm((p) => ({ ...p, customer_id_number: t }))}
                placeholder="TC kimlik no"
                placeholderTextColor="#666"
                keyboardType="number-pad"
              />
              <Text style={styles.fieldLabel}>Müşteri Telefon Numarası :</Text>
              <TextInput
                style={styles.input}
                value={form.customer_phone}
                onChangeText={(t) => setForm((p) => ({ ...p, customer_phone: t }))}
                placeholder="Telefon"
                placeholderTextColor="#666"
                keyboardType="phone-pad"
              />
              <Text style={styles.fieldLabel}>Cari Adı :</Text>
              <TextInput
                style={styles.input}
                value={form.current_name}
                onChangeText={(t) => setForm((p) => ({ ...p, current_name: t }))}
                placeholder="Cari adı"
                placeholderTextColor="#666"
              />
              <Text style={styles.fieldLabel}>Müşteri Şirket Adı :</Text>
              <TextInput
                style={styles.input}
                value={form.customer_company_name}
                onChangeText={(t) => setForm((p) => ({ ...p, customer_company_name: t }))}
                placeholder="Şirket adı"
                placeholderTextColor="#666"
              />
              <Text style={styles.fieldLabel}>Müşteri İli :</Text>
              <TouchableOpacity
                style={styles.selectBox}
                onPress={() => {
                  if (cities.length === 0 && !citiesLoading) {
                    loadCities();
                  }
                  setCityPickerOpen(true);
                }}
              >
                <Text style={selectedCityName ? styles.selectValue : styles.selectPlaceholder}>
                  {citiesLoading
                    ? "Şehirler yükleniyor..."
                    : selectedCityName || "İl seçiniz"}
                </Text>
                <Text style={styles.chevron}>v</Text>
              </TouchableOpacity>
              <Text style={styles.fieldLabel}>Müşteri İlçesi :</Text>
              <TextInput
                style={styles.input}
                value={form.customer_district}
                onChangeText={(t) => setForm((p) => ({ ...p, customer_district: t }))}
                placeholder="İlçe"
                placeholderTextColor="#666"
              />
              <Text style={styles.fieldLabel}>Müşteri Adresi :</Text>
              <TextInput
                style={[styles.input, styles.addressInput]}
                value={form.customer_address}
                onChangeText={(t) => setForm((p) => ({ ...p, customer_address: t }))}
                placeholder="Açık adres"
                placeholderTextColor="#666"
                multiline
                textAlignVertical="top"
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeModal} disabled={saving}>
                  <Text style={styles.cancelBtnText}>Vazgeç</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving}>
                  <Text style={styles.saveBtnText}>
                    {saving ? "Kaydediliyor..." : editingCustomer ? "Güncelle" : "Kaydet"}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={detailCustomer != null} transparent animationType="fade" onRequestClose={closeDetail}>
        <View style={[styles.modalRoot, styles.detailModalRoot]}>
          <Pressable style={styles.modalBackdrop} onPress={closeDetail} />
          <View style={[styles.modalSheet, styles.detailCustomerSheet]}>
            <Text style={[styles.modalTitle, styles.detailCustomerTitle]}>
              {detailCustomer?.customer_name || "Musteri"}
            </Text>
            {detailRecipeDayCount != null ? (
              <Text style={[styles.recipeDurationText, styles.detailRecipeDuration]}>
                {detailCustomer.is_done
                  ? `Reçete ${detailRecipeDayCount} günde tamamlandı.`
                  : `Reçete ${detailRecipeDayCount}. gün (devam ediyor).`}
              </Text>
            ) : null}
            {detailCustomer?.customer_city_name ||
            detailCustomer?.customer_district ||
            detailCustomer?.customer_address ? (
              <Text style={styles.customerLocationText}>
                {[
                  detailCustomer.customer_city_name,
                  detailCustomer.customer_district,
                  detailCustomer.customer_address
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}
            <Text style={[styles.fieldLabel, styles.detailSectionLabel]}>Musteriye ait islemler</Text>
            <View style={[styles.modalActions, styles.detailModalActions]}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => onMarkDone(detailCustomer)}
                disabled={savingTxn || detailCustomer?.is_done === true}
              >
                <Text style={styles.editBtnText}>
                  {detailCustomer?.is_done ? "Tamamlandı" : "Satışı Bitir"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => {
                  setTxnCustomer(detailCustomer);
                  setDetailCustomer(null);
                  setShowIncomeModal(true);
                }}
                disabled={savingTxn}
              >
                <Text style={styles.saveBtnText}>Gelir Ekle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setTxnCustomer(detailCustomer);
                  setDetailCustomer(null);
                  setShowNonStockExpenseModal(true);
                }}
                disabled={savingTxn}
              >
                <Text style={styles.cancelBtnText}>Gider Ekle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sellProductBtn}
                onPress={openCustomerSellFlow}
                disabled={savingTxn || customerSelling}
              >
                <Text style={styles.sellProductBtnText}>Ürün Sat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={onPressExport}
                disabled={savingTxn || exporting || customerSelling}
              >
                <Text style={styles.editBtnText}>{exporting ? "Hazırlanıyor..." : "İndir"}</Text>
              </TouchableOpacity>
            </View>
            {detailMessage ? <Text style={styles.infoText}>{detailMessage}</Text> : null}
            {detailLoading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              style={[styles.txList, styles.detailTxList]}
              contentContainerStyle={styles.detailTxListContent}
            >
              <View style={[styles.txTable, styles.detailTxTable]}>
                <View style={styles.txHeaderRow}>
                  <Text style={[styles.txHeaderCell, styles.txColName]}>İşlem Adı</Text>
                  <Text style={[styles.txHeaderCell, styles.txColType]}>Tür</Text>
                  <Text style={[styles.txHeaderCell, styles.txColAmount]}>Tutar</Text>
                  <Text style={[styles.txHeaderCell, styles.txColDate]}>Tarih</Text>
                  <Text style={[styles.txHeaderCell, styles.txColAction]}>İşlem</Text>
                </View>

                {visibleDetailTransactions.map((item) => {
                  const display = getCustomerTransactionDisplay(item);
                  const amountTxt = Number.isFinite(display.amount)
                    ? `${display.isProfit || item.is_income ? "+" : "-"}${display.amount.toLocaleString("tr-TR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2
                      })}`
                    : "-";
                  const dt = new Date(item.transaction_time || item.created_at);
                  const txName = item.product_name
                    ? `Ürün Satışı: ${item.product_name}`
                    : item.transaction_name || display.typeLabel;
                  const amountStyle = display.isProfit
                    ? styles.profitText
                    : item.is_income
                      ? styles.incomeText
                      : styles.expenseText;

                  return (
                    <View key={item.id} style={styles.txDataRow}>
                      <Text style={[styles.txCell, styles.txColName]} numberOfLines={2}>
                        {txName}
                      </Text>
                      <Text style={[styles.txCell, styles.txColType, amountStyle]}>{display.typeLabel}</Text>
                      <Text style={[styles.txCell, styles.txColAmount, amountStyle]}>{amountTxt}</Text>
                      <Text style={[styles.txCell, styles.txColDate]}>
                        {Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("tr-TR")}
                      </Text>
                      <View style={[styles.txCell, styles.txColAction, styles.txActionCell]}>
                        <TouchableOpacity style={styles.editBtn} onPress={() => openEditTransactionModal(item)}>
                          <Text style={styles.editBtnText}>Düzenle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDeleteTransaction(item)}>
                          <Text style={styles.deleteBtnText}>Sil</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            <Text style={[styles.netSummaryText, styles.detailNetSummary]}>
              Toplam kar:{" "}
              {detailNetAmount.toLocaleString("tr-TR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
              })}
            </Text>
            {!detailLoading && visibleDetailTransactions.length === 0 ? (
              <Text style={styles.emptyText}>Bu müşteri için işlem bulunamadı.</Text>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={customerSellStep != null}
        transparent
        animationType="fade"
        onRequestClose={closeCustomerSellFlow}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => (customerSelling ? null : closeCustomerSellFlow())}
          />
          <View style={[styles.modalSheet, styles.customerSellSheet]}>
            {customerSellStep === "type" ? (
              <>
                <Text style={styles.modalTitle}>Ürün Sat</Text>
                <Text style={styles.customerSellHint}>
                  {detailCustomer?.customer_name || "Müşteri"} için satış türünü seçin.
                </Text>
                <TouchableOpacity
                  style={styles.customerSellTypeBtn}
                  onPress={() => pickCustomerSellType("owned")}
                  disabled={customerSelling}
                >
                  <Text style={styles.customerSellTypeBtnText}>Ürünlerim</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.customerSellTypeBtn}
                  onPress={() => pickCustomerSellType("retail")}
                  disabled={customerSelling}
                >
                  <Text style={styles.customerSellTypeBtnText}>Perakende Ürünlerim</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={closeCustomerSellFlow}>
                  <Text style={styles.cancelBtnText}>Vazgeç</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {customerSellStep === "list" ? (
              <>
                <Text style={styles.modalTitle}>
                  {customerSellListMode === "owned" ? "Ürünlerim" : "Perakende Ürünlerim"}
                </Text>
                <Text style={styles.customerSellHint}>Satılacak ürünü seçin.</Text>
                {customerSellListLoading ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={styles.customerSellLoader} />
                ) : (
                  <ScrollView style={styles.customerSellList}>
                    {customerSellListMode === "owned"
                      ? ownedSellRows.map((item) => (
                          <TouchableOpacity
                            key={item.product_id}
                            style={styles.customerSellRow}
                            onPress={() => startOwnedSellForCustomer(item)}
                            disabled={customerSelling}
                          >
                            <Text style={styles.customerSellRowTitle}>{item.product_name || "-"}</Text>
                            <Text style={styles.customerSellRowMeta}>
                              Adet: {formatSellQty(item.adet)} · Fiyat: {formatSellMoney(item.price)} TL
                            </Text>
                          </TouchableOpacity>
                        ))
                      : retailSellRows.map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            style={styles.customerSellRow}
                            onPress={() => startRetailSellForCustomer(item)}
                            disabled={customerSelling}
                          >
                            <Text style={styles.customerSellRowTitle}>{item.retail_name || "-"}</Text>
                            <Text style={styles.customerSellRowMeta}>
                              Stok: {formatSellQty(item.retail_quantity)} {item.unit_name || ""} · Birim satış:{" "}
                              {formatSellMoney(item.retail_price)} TL
                            </Text>
                          </TouchableOpacity>
                        ))}
                    {(customerSellListMode === "owned" ? ownedSellRows : retailSellRows).length === 0 &&
                    !customerSellListLoading ? (
                      <Text style={styles.customerSellEmpty}>Satilabilir urun yok.</Text>
                    ) : null}
                  </ScrollView>
                )}
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setCustomerSellStep("type")}
                  disabled={customerSelling}
                >
                  <Text style={styles.cancelBtnText}>Geri</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {customerSellStep === "owned-price" ? (
              <>
                <Text style={styles.modalTitle}>Satış fiyatı</Text>
                <Text style={styles.customerSellHint}>
                  {sellOwnedTarget?.product_name || "Ürün"} — KDV dahil değilse oran seçin.
                </Text>
                <ScrollView style={styles.customerSellList} keyboardShouldPersistTaps="handled">
                  <KdvPriceInput
                    label="Satış fiyatı"
                    placeholder="Örn: 100"
                    value={ownedSellPriceInput}
                    onChangeValue={setOwnedSellPriceInput}
                    kdvIncluded={ownedSellKdvIncluded}
                    onKdvIncludedChange={(v) => {
                      setOwnedSellKdvIncluded(v);
                      if (v) setOwnedSellKdvRate(null);
                    }}
                    selectedKdvRate={ownedSellKdvRate}
                    onSelectedKdvRateChange={setOwnedSellKdvRate}
                    kdvRates={kdvRates}
                    inputStyle={styles.input}
                    disabled={customerSelling}
                  />
                </ScrollView>
                <View style={styles.customerSellActionRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setCustomerSellStep("list")}
                    disabled={customerSelling}
                  >
                    <Text style={styles.cancelBtnText}>Geri</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={onCustomerOwnedPriceContinue}
                    disabled={customerSelling}
                  >
                    <Text style={styles.saveBtnText}>Devam</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {customerSellStep === "owned-payment" ? (
              <>
                <Text style={styles.modalTitle}>Tahsilat</Text>
                <Text style={styles.customerSellHint}>
                  {sellOwnedTarget?.product_name || "Ürün"} — Müşteri: {detailCustomer?.customer_name || "-"}
                </Text>
                <Text style={styles.customerSellHint}>
                  Satış fiyati: {getOwnedSalePricePreview() != null ? formatSellMoney(getOwnedSalePricePreview()) : "-"}{" "}
                  TL
                </Text>
                <Text style={styles.customerSellHint}>
                  Ne kadar tahsil ettiniz? Kalan tutar Borçlar Alacaklar sayfasında görünür.
                </Text>
                <TextInput
                  style={styles.input}
                  value={sellReceivedInput}
                  onChangeText={setSellReceivedInput}
                  placeholder="Tahsil edilen tutar"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  editable={!customerSelling}
                />
                <View style={styles.customerSellActionRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setCustomerSellStep("owned-price")}
                    disabled={customerSelling}
                  >
                    <Text style={styles.cancelBtnText}>Geri</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={confirmOwnedSellForCustomer}
                    disabled={customerSelling}
                  >
                    <Text style={styles.saveBtnText}>{customerSelling ? "Kaydediliyor..." : "Sat"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {customerSellStep === "retail-qty" ? (
              <>
                <Text style={styles.modalTitle}>Satis miktari</Text>
                <Text style={styles.customerSellHint}>
                  {sellRetailTarget?.retail_name || "Ürün"} — Mevcut:{" "}
                  {formatSellQty(sellRetailTarget?.retail_quantity)} {sellRetailTarget?.unit_name || ""}
                </Text>
                <TextInput
                  style={styles.input}
                  value={sellQtyInput}
                  onChangeText={setSellQtyInput}
                  placeholder="Kac adet sattiniz?"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  editable={!customerSelling}
                />
                <View style={styles.customerSellActionRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setCustomerSellStep("list")}
                    disabled={customerSelling}
                  >
                    <Text style={styles.cancelBtnText}>Geri</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={onCustomerRetailQtyContinue}
                    disabled={customerSelling}
                  >
                    <Text style={styles.saveBtnText}>Devam</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {customerSellStep === "retail-price" ? (
              <>
                <Text style={styles.modalTitle}>Birim satış fiyatı</Text>
                <Text style={styles.customerSellHint}>
                  {sellRetailTarget?.retail_name || "Ürün"} — Miktar: {sellQtyInput || "-"}
                </Text>
                <ScrollView style={styles.customerSellList} keyboardShouldPersistTaps="handled">
                  <KdvPriceInput
                    label="Birim satış fiyatı"
                    placeholder="Birim satış fiyatı"
                    value={retailSellUnitInput}
                    onChangeValue={setRetailSellUnitInput}
                    kdvIncluded={retailSellKdvIncluded}
                    onKdvIncludedChange={(v) => {
                      setRetailSellKdvIncluded(v);
                      if (v) setRetailSellKdvRate(null);
                    }}
                    selectedKdvRate={retailSellKdvRate}
                    onSelectedKdvRateChange={setRetailSellKdvRate}
                    kdvRates={kdvRates}
                    inputStyle={styles.input}
                    disabled={customerSelling}
                  />
                </ScrollView>
                <View style={styles.customerSellActionRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setCustomerSellStep("retail-qty")}
                    disabled={customerSelling}
                  >
                    <Text style={styles.cancelBtnText}>Geri</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={onCustomerRetailPriceContinue}
                    disabled={customerSelling}
                  >
                    <Text style={styles.saveBtnText}>Devam</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {customerSellStep === "retail-payment" ? (
              <>
                <Text style={styles.modalTitle}>Tahsilat</Text>
                <Text style={styles.customerSellHint}>
                  {sellRetailTarget?.retail_name || "Ürün"} — Toplam:{" "}
                  {getRetailSaleTotalPreview() != null ? formatSellMoney(getRetailSaleTotalPreview()) : "-"} TL
                </Text>
                <Text style={styles.customerSellHint}>
                  Ne kadar tahsil ettiniz? Kalan tutar Borçlar Alacaklar sayfasında görünür.
                </Text>
                <TextInput
                  style={styles.input}
                  value={sellReceivedInput}
                  onChangeText={setSellReceivedInput}
                  placeholder="Tahsil edilen tutar"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  editable={!customerSelling}
                />
                <View style={styles.customerSellActionRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setCustomerSellStep("retail-price")}
                    disabled={customerSelling}
                  >
                    <Text style={styles.cancelBtnText}>Geri</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={confirmRetailSellForCustomer}
                    disabled={customerSelling}
                  >
                    <Text style={styles.saveBtnText}>{customerSelling ? "Kaydediliyor..." : "Sat"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={showIncomeModal} transparent animationType="fade" onRequestClose={() => setShowIncomeModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => !savingTxn && setShowIncomeModal(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Gelir Ekle</Text>
            <TextInput
              style={styles.input}
              value={incomeName}
              onChangeText={setIncomeName}
              placeholder="Gelir adi"
              placeholderTextColor="#666"
            />
            <TextInput
              style={styles.input}
              value={incomeAmount}
              onChangeText={setIncomeAmount}
              placeholder="Gelir tutari"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={submitIncome} disabled={savingTxn}>
              <Text style={styles.saveBtnText}>{savingTxn ? "Kaydediliyor..." : "Kaydet"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showNonStockExpenseModal} transparent animationType="fade" onRequestClose={() => setShowNonStockExpenseModal(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => !savingTxn && setShowNonStockExpenseModal(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Gider Ekle</Text>
            <TextInput
              style={styles.input}
              value={nonStockExpenseName}
              onChangeText={setNonStockExpenseName}
              placeholder="Gider adi"
              placeholderTextColor="#666"
            />
            <TextInput
              style={styles.input}
              value={nonStockExpenseAmount}
              onChangeText={setNonStockExpenseAmount}
              placeholder="Gider tutari"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={submitNonStockExpense} disabled={savingTxn}>
              <Text style={styles.saveBtnText}>{savingTxn ? "Kaydediliyor..." : "Kaydet"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editingTransaction != null}
        transparent
        animationType="fade"
        onRequestClose={closeEditTransactionModal}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeEditTransactionModal} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>İşlemi Düzenle</Text>
            <TextInput
              style={styles.input}
              value={editTxnName}
              onChangeText={setEditTxnName}
              placeholder="İşlem adı"
              placeholderTextColor="#666"
            />
            <TextInput
              style={styles.input}
              value={editTxnAmount}
              onChangeText={setEditTxnAmount}
              placeholder="Tutar"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeEditTransactionModal} disabled={savingTxnEdit}>
                <Text style={styles.cancelBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={onSaveTransactionEdit} disabled={savingTxnEdit}>
                <Text style={styles.saveBtnText}>
                  {savingTxnEdit ? "Kaydediliyor..." : "Kaydet"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    {renderCustomersNoticeModal()}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  outerContent: {
    paddingBottom: 28,
    paddingHorizontal: HORIZONTAL_PADDING
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 10
  },
  titleInTopRow: {
    marginBottom: 0
  },
  title: {
    flex: 1,
    color: COLORS.primary,
    fontSize: 26,
    fontWeight: "800"
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10
  },
  addBtnText: {
    color: COLORS.black,
    fontSize: 13,
    fontWeight: "700"
  },
  searchInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.primary,
    fontSize: 14,
    marginBottom: 10,
    backgroundColor: COLORS.black
  },
  quickFilterRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 10,
    gap: 10
  },
  quickFilterBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  quickFilterBtnActive: {
    backgroundColor: COLORS.primary
  },
  quickFilterBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700"
  },
  quickFilterBtnTextActive: {
    color: COLORS.black
  },
  infoText: {
    color: COLORS.textLight,
    fontSize: 12,
    marginBottom: 8,
    opacity: 0.9
  },
  loader: {
    marginBottom: 10
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
    paddingHorizontal: 8
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
    width: 160,
    textAlign: "left"
  },
  colCari: {
    width: 150,
    textAlign: "left"
  },
  colCompany: {
    width: 170,
    textAlign: "left"
  },
  colCity: {
    width: 120,
    textAlign: "left"
  },
  colDistrict: {
    width: 120,
    textAlign: "left"
  },
  colAction: {
    width: 170
  },
  actionCell: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8
  },
  editBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  editBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700"
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: "#d9534f",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  deleteBtnText: {
    color: "#d9534f",
    fontSize: 12,
    fontWeight: "700"
  },
  sellProductBtn: {
    borderWidth: 1,
    borderColor: "#28a745",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#1a3d24"
  },
  sellProductBtnText: {
    color: "#62d26f",
    fontSize: 12,
    fontWeight: "800"
  },
  customerSellSheet: {
    maxHeight: "85%"
  },
  customerSellHint: {
    color: COLORS.textLight,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10
  },
  customerSellTypeBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    backgroundColor: COLORS.black
  },
  customerSellTypeBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center"
  },
  customerSellList: {
    maxHeight: 280,
    marginBottom: 10
  },
  customerSellLoader: {
    marginVertical: 16
  },
  customerSellRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: COLORS.black
  },
  customerSellRowTitle: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700"
  },
  customerSellRowMeta: {
    color: COLORS.textLight,
    fontSize: 12,
    marginTop: 4
  },
  customerSellEmpty: {
    color: COLORS.textLight,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16
  },
  customerSellActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8
  },
  emptyRow: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black,
    paddingVertical: 16,
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
  detailModalRoot: {
    justifyContent: "center",
    paddingVertical: 20,
    paddingHorizontal: 4
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  modalSheet: {
    marginHorizontal: HORIZONTAL_PADDING,
    maxHeight: "80%",
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 14
  },
  /** Müşteri detay modalı: daha geniş ve ferah */
  detailCustomerSheet: {
    marginHorizontal: 8,
    maxHeight: Math.min(SCREEN_HEIGHT * 0.94, 900),
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 18
  },
  detailCustomerTitle: {
    fontSize: 22,
    lineHeight: 28,
    marginBottom: 6
  },
  detailRecipeDuration: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 0,
    marginBottom: 14
  },
  detailSectionLabel: {
    fontSize: 14,
    marginBottom: 10,
    marginTop: 4
  },
  detailModalActions: {
    flexWrap: "wrap",
    justifyContent: "flex-start",
    rowGap: 10,
    columnGap: 10,
    marginTop: 4,
    marginBottom: 10
  },
  detailTxList: {
    maxHeight: Math.min(SCREEN_HEIGHT * 0.46, 420),
    marginTop: 10
  },
  detailTxListContent: {
    paddingBottom: 6
  },
  detailTxTable: {
    minWidth: 900
  },
  detailNetSummary: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
    marginBottom: 6
  },
  modalTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12
  },
  recipeDurationText: {
    color: COLORS.textLight,
    fontSize: 13,
    fontWeight: "600",
    marginTop: -6,
    marginBottom: 10
  },
  fieldLabel: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.primary,
    fontSize: 14,
    marginBottom: 12,
    backgroundColor: COLORS.black
  },
  addressInput: {
    minHeight: 72
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
  cityPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 10
  },
  cityPickerBackBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  cityPickerBackText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700"
  },
  cityPickerTitle: {
    flex: 1,
    marginBottom: 0
  },
  cityPickerList: {
    maxHeight: 420
  },
  cityPickerRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  cityPickerRowText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "600"
  },
  cityPickerEmpty: {
    color: COLORS.textLight,
    fontSize: 13,
    paddingVertical: 16,
    textAlign: "center"
  },
  customerLocationText: {
    color: COLORS.textLight,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
    marginBottom: 4
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  cancelBtnText: {
    color: COLORS.textLight,
    fontSize: 13,
    fontWeight: "600"
  },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: COLORS.primary
  },
  saveBtnText: {
    color: COLORS.black,
    fontSize: 13,
    fontWeight: "700"
  },
  txList: {
    maxHeight: 220,
    marginTop: 8
  },
  txTable: {
    minWidth: 820,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    overflow: "hidden"
  },
  txHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#131313",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  txDataRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 10
  },
  txHeaderCell: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    paddingVertical: 11,
    paddingHorizontal: 10
  },
  txCell: {
    color: COLORS.textLight,
    fontSize: 13,
    paddingVertical: 4,
    paddingHorizontal: 10
  },
  txColName: {
    width: 300
  },
  txColType: {
    width: 100
  },
  txColAmount: {
    width: 130
  },
  txColDate: {
    width: 140
  },
  txColAction: {
    width: 220
  },
  txActionCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  incomeText: {
    color: "#62d26f"
  },
  profitText: {
    color: "#e8c547"
  },
  expenseText: {
    color: "#ff6d6d"
  },
  netSummaryText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10
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
