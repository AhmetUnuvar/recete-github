import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";
import { getCustomers } from "../services/customerService";
import {
  deleteTransaction,
  getTransactions,
  updateTransaction
} from "../services/transactionsService";
import { exportAndShareTable } from "../services/tableMakerService";

const parseDateInput = (value, endOfDay = false) => {
  const txt = String(value || "").trim();
  if (!txt) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
};

const formatDateTime = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("tr-TR");
};

const formatAmount = (value) => {
  const n = Number(value);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export default function EarningsSummaryScreen({ userId, onTransactionsMutated }) {
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [startDateText, setStartDateText] = useState("");
  const [endDateText, setEndDateText] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editTxnName, setEditTxnName] = useState("");
  const [editTxnAmount, setEditTxnAmount] = useState("");
  const [savingTxnEdit, setSavingTxnEdit] = useState(false);

  const customerNameById = useMemo(() => {
    const map = new Map();
    for (const c of customers) {
      map.set(c.id, c.customer_name || "-");
    }
    return map;
  }, [customers]);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setCustomers([]);
      setMessage("Giriş yapılmamış.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      const [txRows, customerRows] = await Promise.all([
        getTransactions(userId, 2000),
        getCustomers(userId)
      ]);
      setRows(txRows);
      setCustomers(customerRows);
    } catch (error) {
      setRows([]);
      setCustomers([]);
      setMessage(error.message || "Veriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filteredRows = useMemo(() => {
    const customerNeedle = customerSearch.trim().toLocaleLowerCase("tr");
    const startDate = parseDateInput(startDateText, false);
    const endDate = parseDateInput(endDateText, true);

    return rows.filter((tx) => {
      const buyerName = (customerNameById.get(tx.buyer_id) || "").toLocaleLowerCase("tr");
      if (customerNeedle && !buyerName.includes(customerNeedle)) return false;

      if (startDate || endDate) {
        const txDate = new Date(tx.transaction_time);
        if (Number.isNaN(txDate.getTime())) return false;
        if (startDate && txDate < startDate) return false;
        if (endDate && txDate > endDate) return false;
      }

      return true;
    });
  }, [rows, customerNameById, customerSearch, startDateText, endDateText]);

  const exportEarningsTable = async (format) => {
    try {
      setExporting(true);
      const columns = [
        { key: "customer", label: "Müşteri" },
        { key: "type", label: "Tür" },
        { key: "name", label: "İşlem Adı" },
        { key: "amount", label: "Tutar" },
        { key: "date", label: "Tarih" }
      ];
      const rowsForExport = filteredRows.map((tx) => {
        const isIncome = tx.is_income === true;
        return {
          customer: customerNameById.get(tx.buyer_id) || "-",
          type: isIncome ? "Gelir" : "Gider",
          name: tx.product_name
            ? `Ürün Satışı: ${tx.product_name}`
            : tx.transaction_name || (isIncome ? "Gelir" : "Gider"),
          amount: formatAmount(tx.amount),
          date: formatDateTime(tx.transaction_time)
        };
      });
      await exportAndShareTable({
        title: "Kazanç Özeti Tablosu",
        columns,
        rows: rowsForExport,
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
      { text: "CSV", onPress: () => exportEarningsTable("csv") },
      { text: "PNG", onPress: () => exportEarningsTable("png") }
    ]);
  };

  const openEditTransactionModal = (item) => {
    setEditingTransaction(item);
    setEditTxnName(
      String(item.transaction_name || "").trim()
        ? String(item.transaction_name || "")
        : item.product_name
          ? `Ürün Satışı: ${item.product_name}`
          : ""
    );
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
    if (!userId || !editingTransaction?.id) return;
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
        transactionName: editTxnName.trim() || null
      });
      closeEditTransactionModal();
      await load();
      onTransactionsMutated?.();
      Alert.alert("Başarılı", "İşlem güncellendi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "İşlem güncellenemedi.");
    } finally {
      setSavingTxnEdit(false);
    }
  };

  const onDeleteTransaction = (item) => {
    if (!userId || !item?.id) return;
    Alert.alert("İşlemi Sil", "Bu işlem kazanç özetinden silinecek ve ana sayfa grafiği de bu kaynağa göre güncellenir.", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTransaction({ userId, transactionId: item.id });
            await load();
            onTransactionsMutated?.();
            Alert.alert("Silindi", "İşlem silindi.");
          } catch (error) {
            Alert.alert("Hata", error.message || "İşlem silinemedi.");
          }
        }
      }
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
      }
    >
      <Text style={styles.title}>Kazanç Özeti</Text>
      {!userId ? <Text style={styles.messageText}>Verileri görmek için giriş yapın.</Text> : null}
      {message ? <Text style={styles.messageText}>{message}</Text> : null}

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setFiltersVisible(true)}>
          <Text style={styles.secondaryBtnText}>Filtreler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onPressExport} disabled={exporting}>
          <Text style={styles.secondaryBtnText}>{exporting ? "Hazırlanıyor..." : "İndir"}</Text>
        </TouchableOpacity>
      </View>

      {loading && rows.length === 0 ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.table}>
          <View style={[styles.tr, styles.thead]}>
            <Text style={[styles.th, styles.colCustomer]}>Müşteri</Text>
            <Text style={[styles.th, styles.colType]}>Tür</Text>
            <Text style={[styles.th, styles.colName]}>İşlem Adı</Text>
            <Text style={[styles.th, styles.colAmount]}>Tutar</Text>
            <Text style={[styles.th, styles.colDate]}>Tarih</Text>
            <Text style={[styles.th, styles.colAction]}>İşlem</Text>
          </View>

          {filteredRows.map((tx) => {
            const isIncome = tx.is_income === true;
            const customerName = customerNameById.get(tx.buyer_id) || "-";
            const txnName = tx.product_name
              ? `Ürün Satışı: ${tx.product_name}`
              : tx.transaction_name || (isIncome ? "Gelir" : "Gider");

            return (
              <View key={tx.id} style={styles.tr}>
                <Text style={[styles.td, styles.colCustomer]}>{customerName}</Text>
                <Text style={[styles.td, styles.colType, isIncome ? styles.incomeText : styles.expenseText]}>
                  {isIncome ? "Gelir" : "Gider"}
                </Text>
                <Text style={[styles.td, styles.colName]}>{txnName}</Text>
                <Text style={[styles.td, styles.colAmount, isIncome ? styles.incomeText : styles.expenseText]}>
                  {formatAmount(tx.amount)}
                </Text>
                <Text style={[styles.td, styles.colDate]}>{formatDateTime(tx.transaction_time)}</Text>
                <View style={[styles.td, styles.colAction, styles.actionCell]}>
                  <TouchableOpacity
                    style={styles.rowActionBtn}
                    onPress={() => openEditTransactionModal(tx)}
                    disabled={!userId}
                  >
                    <Text style={styles.rowActionBtnText}>Düzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rowActionBtn, styles.rowActionBtnDanger]}
                    onPress={() => onDeleteTransaction(tx)}
                    disabled={!userId}
                  >
                    <Text style={[styles.rowActionBtnText, styles.rowActionBtnTextDanger]}>Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {!loading && filteredRows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Filtreye uygun işlem bulunamadı.</Text>
        </View>
      ) : null}

      <Modal visible={filtersVisible} transparent animationType="fade" onRequestClose={() => setFiltersVisible(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setFiltersVisible(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.filterTitle}>Filtreler</Text>
            <TextInput
              style={styles.input}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Müşteri adına göre ara"
              placeholderTextColor="#666"
            />
            <TextInput
              style={styles.input}
              value={startDateText}
              onChangeText={setStartDateText}
              placeholder="Başlangıç (YYYY-AA-GG)"
              placeholderTextColor="#666"
            />
            <TextInput
              style={styles.input}
              value={endDateText}
              onChangeText={setEndDateText}
              placeholder="Bitiş (YYYY-AA-GG)"
              placeholderTextColor="#666"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  setCustomerSearch("");
                  setStartDateText("");
                  setEndDateText("");
                }}
              >
                <Text style={styles.secondaryBtnText}>Temizle</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setFiltersVisible(false)}>
                <Text style={styles.primaryBtnText}>Uygula</Text>
              </TouchableOpacity>
            </View>
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
          <Pressable style={styles.modalBackdrop} onPress={() => !savingTxnEdit && closeEditTransactionModal()} />
          <View style={styles.modalSheet}>
            <Text style={styles.filterTitle}>İşlemi düzenle</Text>
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
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={closeEditTransactionModal}
                disabled={savingTxnEdit}
              >
                <Text style={styles.secondaryBtnText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={onSaveTransactionEdit}
                disabled={savingTxnEdit}
              >
                <Text style={styles.primaryBtnText}>{savingTxnEdit ? "Kaydediliyor..." : "Kaydet"}</Text>
              </TouchableOpacity>
            </View>
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
    fontSize: 30,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 10
  },
  messageText: {
    color: COLORS.textLight,
    fontSize: 13,
    marginBottom: 8
  },
  filterTitle: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700"
  },
  loader: {
    marginVertical: 16
  },
  table: {
    minWidth: 1000,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.black
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  thead: {
    backgroundColor: "#131313"
  },
  th: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    paddingVertical: 10,
    paddingHorizontal: 8
  },
  td: {
    color: COLORS.textLight,
    fontSize: 12,
    paddingVertical: 9,
    paddingHorizontal: 8
  },
  colDate: {
    width: 170
  },
  colType: {
    width: 90
  },
  colCustomer: {
    width: 170
  },
  colName: {
    width: 260
  },
  colAmount: {
    width: 140
  },
  colAction: {
    width: 140
  },
  actionCell: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 6,
    alignItems: "stretch"
  },
  rowActionBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: "center"
  },
  rowActionBtnDanger: {
    borderColor: "#d9534f"
  },
  rowActionBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700"
  },
  rowActionBtnTextDanger: {
    color: "#d9534f"
  },
  incomeText: {
    color: "#28a745",
    fontWeight: "700"
  },
  expenseText: {
    color: "#d9534f",
    fontWeight: "700"
  },
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: HORIZONTAL_PADDING
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  modalSheet: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    padding: 12
  },
  modalActions: {
    marginTop: 4,
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  primaryBtnText: {
    color: COLORS.black,
    fontSize: 12,
    fontWeight: "800"
  },
  emptyBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    padding: 12
  },
  emptyText: {
    color: COLORS.textLight,
    fontSize: 13
  }
});
