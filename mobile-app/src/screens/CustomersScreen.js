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
  RefreshControl
} from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING, SCREEN_HEIGHT } from "../constants/layout";
import {
  createCustomer,
  deleteCustomer,
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
  dismissNotification,
  getPendingNotificationsForPage,
  TARGET_PAGE_CUSTOMERS
} from "../services/notificationService";

const emptyForm = () => ({
  customer_name: "",
  customer_id_number: "",
  customer_phone: "",
  current_name: "",
  customer_company_name: ""
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

export default function CustomersScreen({ userId, customersFocusNonce = 0 }) {
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
    setModalOpen(true);
  };

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setForm({
      customer_name: customer.customer_name || "",
      customer_id_number: customer.customer_id_number || "",
      customer_phone: customer.customer_phone || "",
      current_name: customer.current_name || "",
      customer_company_name: customer.customer_company_name || ""
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
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
    try {
      setSaving(true);
      const payload = {
        customer_name: name,
        customer_id_number: form.customer_id_number,
        customer_phone: form.customer_phone,
        current_name: form.current_name,
        customer_company_name: form.customer_company_name
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
    if (savingTxn) return;
    setDetailCustomer(null);
    setDetailTransactions([]);
    setDetailMessage("");
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
      const rows = (transactions || []).map((item) => {
        const n = Number(item.amount);
        const dt = new Date(item.transaction_time || item.created_at);
        return {
          transaction_name: item.product_name
            ? `Ürün Satışı: ${item.product_name}`
            : item.transaction_name || (item.is_income ? "Gelir" : "Gider"),
          type: item.is_income ? "Gelir" : "Gider",
          amount: Number.isFinite(n)
            ? `${item.is_income ? "+" : "-"}${n.toLocaleString("tr-TR", {
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
        [c.customer_name, c.customer_phone, c.customer_id_number, c.current_name, c.customer_company_name]
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

  const detailNetAmount = useMemo(
    () =>
      sortedDetailTransactions.reduce((sum, item) => {
        const n = Number(item.amount);
        if (!Number.isFinite(n)) return sum;
        return sum + (item.is_income ? n : -n);
      }, 0),
    [sortedDetailTransactions]
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

  const tableMinWidth = 1060;

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
        <Text style={styles.title}>Müşteriler</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openModal} disabled={!userId}>
          <Text style={styles.addBtnText}>Müşteri Ekle</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Müşteri adı, telefon, TC, cari veya şirket ile ara"
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

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <View style={styles.modalSheet}>
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
            <Text style={[styles.fieldLabel, styles.detailSectionLabel]}>Musteriye ait islemler</Text>
            <View style={[styles.modalActions, styles.detailModalActions]}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => onMarkDone(detailCustomer)}
                disabled={savingTxn || detailCustomer?.is_done === true}
              >
                <Text style={styles.editBtnText}>
                  {detailCustomer?.is_done ? "Tamamlandı" : "Reçeteyi Tamamla"}
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
                style={styles.editBtn}
                onPress={onPressExport}
                disabled={savingTxn || exporting}
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

                {sortedDetailTransactions.map((item) => {
                  const n = Number(item.amount);
                  const amountTxt = Number.isFinite(n)
                    ? `${item.is_income ? "+" : "-"}${n.toLocaleString("tr-TR", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2
                      })}`
                    : "-";
                  const dt = new Date(item.transaction_time || item.created_at);
                  const txName = item.product_name
                    ? `Ürün Satışı: ${item.product_name}`
                    : item.transaction_name || (item.is_income ? "Gelir" : "Gider");

                  return (
                    <View key={item.id} style={styles.txDataRow}>
                      <Text style={[styles.txCell, styles.txColName]} numberOfLines={2}>
                        {txName}
                      </Text>
                      <Text
                        style={[
                          styles.txCell,
                          styles.txColType,
                          item.is_income ? styles.incomeText : styles.expenseText
                        ]}
                      >
                        {item.is_income ? "Gelir" : "Gider"}
                      </Text>
                      <Text
                        style={[
                          styles.txCell,
                          styles.txColAmount,
                          item.is_income ? styles.incomeText : styles.expenseText
                        ]}
                      >
                        {amountTxt}
                      </Text>
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
              Toplam kazanılan para:{" "}
              {detailNetAmount.toLocaleString("tr-TR", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
              })}
            </Text>
            {!detailLoading && sortedDetailTransactions.length === 0 ? (
              <Text style={styles.emptyText}>Bu müşteri için işlem bulunamadı.</Text>
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
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 10
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
