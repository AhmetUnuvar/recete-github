import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform
} from "react-native";
import { COLORS } from "../constants/colors";
import PageTitleRow from "../components/PageTitleRow";
import { HORIZONTAL_PADDING } from "../constants/layout";
import {
  getBalances,
  settleBalance,
  updateBalancePaymentDate,
  patchBalance
} from "../services/receivablesPayablesService";

const formatAmount = (v) => {
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
};

const formatDateShort = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("tr-TR");
};

const parseTrDate = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
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

const formatDateToIsoLocal = (d) => {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
};

const isoToTrDisplay = (raw) => {
  if (raw === undefined || raw === null || raw === "") return "";
  const s = String(raw).includes("T") ? String(raw).split("T")[0] : String(raw).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const [, y, mo, da] = m;
  return `${da}.${mo}.${y}`;
};

const normalizeRowPaymentDate = (v) => {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) {
    const d = v;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const head = String(v).slice(0, 10);
  const m = head.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const calendarDaysUntil = (paymentNorm) => {
  if (!paymentNorm) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const t = paymentNorm;
  const targetDay = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((targetDay - today) / 86400000);
};

const formatCountdownLabel = (days, isReceivable) => {
  const prefix = isReceivable ? "Tahsile" : "Odemeye";
  if (days === 0) return `${prefix} bugun`;
  if (days > 0) return `${prefix} ${days} gun kaldi`;
  return `${prefix} ${Math.abs(days)} gun gecti`;
};

export default function DebtsReceivablesScreen({ userId, onTransactionsMutated }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState(null);
  const [settleAmountInput, setSettleAmountInput] = useState("");
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateTarget, setDateTarget] = useState(null);
  const [dateInput, setDateInput] = useState("");
  const [dateSubmitting, setDateSubmitting] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editRemainingInput, setEditRemainingInput] = useState("");
  const [editDateInput, setEditDateInput] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setError("");
    try {
      const data = await getBalances(userId);
      setRows(data);
    } catch (e) {
      setError(e.message || "Veri yuklenemedi.");
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openSettle = (row) => {
    const rem = Number(row.remaining_amount);
    const safeRem = Number.isFinite(rem) ? Math.round(rem * 10000) / 10000 : 0;
    setSettleTarget(row);
    setSettleAmountInput(safeRem > 0 ? String(safeRem) : "");
    setSettleModalOpen(true);
  };

  const closeSettleModal = () => {
    if (settleSubmitting) return;
    setSettleModalOpen(false);
    setSettleTarget(null);
    setSettleAmountInput("");
  };

  const closeDateModal = () => {
    if (dateSubmitting) return;
    setDateModalOpen(false);
    setDateTarget(null);
    setDateInput("");
  };

  const openDateModal = (row) => {
    setDateTarget(row);
    const existing = row?.payment_date != null ? isoToTrDisplay(row.payment_date) : "";
    setDateInput(existing);
    setDateModalOpen(true);
  };

  const closeEditModal = () => {
    if (editSubmitting) return;
    setEditModalOpen(false);
    setEditTarget(null);
    setEditRemainingInput("");
    setEditDateInput("");
  };

  const openEditModal = (row) => {
    setEditTarget(row);
    const rem = Number(row.remaining_amount);
    const safeRem = Number.isFinite(rem) ? Math.round(rem * 10000) / 10000 : 0;
    setEditRemainingInput(String(safeRem));
    const existingDate = row?.payment_date != null ? isoToTrDisplay(row.payment_date) : "";
    setEditDateInput(existingDate);
    setEditModalOpen(true);
  };

  const onSaveEdit = async () => {
    if (!userId || !editTarget?.id) return;
    const totalCap = Number(editTarget.amount);
    const rem = Number(String(editRemainingInput || "").replace(",", "."));
    if (Number.isNaN(rem) || rem < 0) {
      Alert.alert("Uyari", "Kalan tutar gecerli bir sayi olmalidir (0 veya buyuk).");
      return;
    }
    if (rem > totalCap + 1e-6) {
      Alert.alert("Uyari", `Kalan tutar, toplam tutardan (${formatAmount(totalCap)}) buyuk olamaz.`);
      return;
    }

    let payment_date;
    const dateTrim = String(editDateInput || "").trim();
    if (dateTrim === "") {
      payment_date = null;
    } else {
      const pd = parseTrDate(dateTrim);
      if (!pd) {
        Alert.alert("Uyari", "Tarihi GG.AA.YYYY olarak girin veya tarih icin alani bos birakin.");
        return;
      }
      payment_date = formatDateToIsoLocal(pd);
    }

    try {
      setEditSubmitting(true);
      await patchBalance({
        userId,
        balanceId: editTarget.id,
        remaining_amount: rem,
        payment_date
      });
      setEditModalOpen(false);
      setEditTarget(null);
      setEditRemainingInput("");
      setEditDateInput("");
      await load();
      Alert.alert("Tamam", "Kayit guncellendi.");
    } catch (e) {
      Alert.alert("Hata", e.message || "Kayit guncellenemedi.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const onSavePaymentDate = async (clearDate) => {
    if (!userId || !dateTarget?.id) return;
    try {
      setDateSubmitting(true);
      if (clearDate) {
        await updateBalancePaymentDate({ userId, balanceId: dateTarget.id, payment_date: null });
      } else {
        const parsed = parseTrDate(dateInput);
        if (!parsed) {
          Alert.alert("Uyari", "Tarihi GG.AA.YYYY formatinda girin (ornek: 09.05.2026).");
          return;
        }
        await updateBalancePaymentDate({
          userId,
          balanceId: dateTarget.id,
          payment_date: formatDateToIsoLocal(parsed)
        });
      }
      setDateModalOpen(false);
      setDateTarget(null);
      setDateInput("");
      await load();
    } catch (e) {
      Alert.alert("Hata", e.message || "Tarih kaydedilemedi.");
    } finally {
      setDateSubmitting(false);
    }
  };

  const onConfirmSettle = async () => {
    if (!userId || !settleTarget?.id) return;
    const maxRem = Number(settleTarget.remaining_amount);
    const pay = Number(String(settleAmountInput || "").replace(",", "."));
    if (Number.isNaN(pay) || pay <= 0) {
      Alert.alert("Uyari", "Gecerli bir tutar girin.");
      return;
    }
    if (pay > maxRem + 1e-6) {
      Alert.alert("Uyari", "Tutar kalan tutardan buyuk olamaz.");
      return;
    }
    try {
      setSettleSubmitting(true);
      await settleBalance({ userId, balanceId: settleTarget.id, amount: pay });
      if (typeof onTransactionsMutated === "function") {
        onTransactionsMutated();
      }
      setSettleModalOpen(false);
      setSettleTarget(null);
      setSettleAmountInput("");
      await load();
      Alert.alert("Tamam", "Islem kaydedildi.");
    } catch (e) {
      Alert.alert("Hata", e.message || "Islem tamamlanamadi.");
    } finally {
      setSettleSubmitting(false);
    }
  };

  if (!userId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Kullanici bilgisi yok.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const settleTitle = settleTarget?.is_receivable ? "Tahsil et" : "Ode";
  const dateModalTitle =
    dateTarget?.is_receivable === true ? "Tahsil tarihi sec" : "Odeme tarihi sec";

  return (
    <KeyboardAvoidingView
      style={styles.keyboardRoot}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={64}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <PageTitleRow title="Borclar Alacaklar" titleStyle={styles.title} />
        <Text style={styles.subtitle}>
          Alacak satirlarinda tahsil / borcta odeme kaydi; tarih ile tahsil veya odeme hedefini gorun. Kalan sifirlaninca kayit listeden duser.
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!error && rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Kayit yok.</Text>
          </View>
        ) : null}
        {rows.length > 0 ? (
          rows.map((r) => {
            const party = r.seller_name || r.customer_name || r.fixed_name || "-";
            const typeLabel = r.is_receivable ? "Alacak" : "Borc";
            const btnLabel = r.is_receivable ? "Tahsil et" : "Ode";
            return (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardType}>{typeLabel}</Text>
                  <Text style={styles.cardDate}>{formatDateShort(r.created_at)}</Text>
                </View>
                <Text style={styles.cardParty} numberOfLines={2}>
                  {party}
                </Text>
                <View style={styles.cardAmountRow}>
                  <Text style={styles.cardAmountLabel}>Toplam</Text>
                  <Text style={styles.cardAmountValue}>{formatAmount(r.amount)}</Text>
                </View>
                <View style={styles.cardAmountRow}>
                  <Text style={styles.cardAmountLabel}>Kalan</Text>
                  <Text style={styles.cardAmountValueHighlight}>{formatAmount(r.remaining_amount)}</Text>
                </View>
                {(() => {
                  const pn = normalizeRowPaymentDate(r.payment_date);
                  const diff = pn != null ? calendarDaysUntil(pn) : null;
                  return pn != null && diff != null ? (
                    <Text style={styles.paymentDueLine}>
                      {formatCountdownLabel(diff, r.is_receivable)} ({isoToTrDisplay(r.payment_date)})
                    </Text>
                  ) : null;
                })()}
                <TouchableOpacity style={styles.editOutlineBtn} onPress={() => openEditModal(r)} activeOpacity={0.85}>
                  <Text style={styles.editOutlineBtnText}>Duzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateChipBtn} onPress={() => openDateModal(r)} activeOpacity={0.85}>
                  <Text style={styles.dateChipBtnText}>
                    {r.is_receivable ? "Tahsil tarihi ekle" : "Odeme tarihi ekle"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, r.is_receivable ? styles.actionBtnReceivable : styles.actionBtnPayable]}
                  onPress={() => openSettle(r)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.actionBtnText, !r.is_receivable && styles.actionBtnTextInverse]}>
                    {btnLabel}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        ) : null}
      </ScrollView>

      <Modal
        visible={settleModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeSettleModal}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeSettleModal} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{settleTitle}</Text>
            {settleTarget ? (
              <Text style={styles.modalSubtitle}>
                Kalan: {formatAmount(settleTarget.remaining_amount)} ·{" "}
                {settleTarget.is_receivable ? "alinan gelir olarak kaydedilir" : "odenen gider olarak kaydedilir"}.
              </Text>
            ) : null}
            <TextInput
              style={styles.modalInput}
              value={settleAmountInput}
              onChangeText={setSettleAmountInput}
              placeholder="Tutar"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
              editable={!settleSubmitting}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeSettleModal} disabled={settleSubmitting}>
                <Text style={styles.modalCancelText}>Vazgec</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOkBtn}
                onPress={onConfirmSettle}
                disabled={settleSubmitting}
              >
                <Text style={styles.modalOkText}>{settleSubmitting ? "Kaydediliyor..." : "Onayla"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={dateModalOpen} transparent animationType="fade" onRequestClose={closeDateModal}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeDateModal} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{dateModalTitle}</Text>
            <Text style={styles.modalSubtitle}>
              GG.AA.YYYY (ornek: 15.06.2026). Kaydettikten sonra bu tarihe gore bugun icin kalan gun sayilir.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={dateInput}
              onChangeText={setDateInput}
              placeholder="GG.AA.YYYY"
              placeholderTextColor="#666"
              keyboardType="numbers-and-punctuation"
              editable={!dateSubmitting}
            />
            <View style={styles.modalActionsStack}>
              <View style={[styles.modalActions, { justifyContent: "space-between", flexWrap: "wrap", rowGap: 10 }]}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => onSavePaymentDate(true)}
                  disabled={dateSubmitting}
                >
                  <Text style={styles.modalCancelText}>Kaldir</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={closeDateModal} disabled={dateSubmitting}>
                  <Text style={styles.modalCancelText}>Vazgec</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.modalOkBtn, { alignSelf: "stretch", alignItems: "center" }]}
                onPress={() => onSavePaymentDate(false)}
                disabled={dateSubmitting}
              >
                <Text style={styles.modalOkText}>{dateSubmitting ? "Kaydediliyor..." : "Kaydet"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editModalOpen} transparent animationType="fade" onRequestClose={closeEditModal}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeEditModal} />
          <View style={[styles.modalSheet, styles.editModalSheet]}>
            <Text style={styles.modalTitle}>Duzenle</Text>
            {editTarget ? (
              <>
                <Text style={styles.modalSubtitle}>
                  Toplam kayit tutari degismez ({formatAmount(editTarget.amount)}). Sadece kalan ve tarih ile oynarsiniz;
                  tarih alanini bos birakinca hedef tarih kaldirilir.
                </Text>
                <Text style={styles.modalFieldLabel}>Kalan tutar</Text>
                <TextInput
                  style={styles.modalInputTight}
                  value={editRemainingInput}
                  onChangeText={setEditRemainingInput}
                  placeholder="Kalan tutar"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  editable={!editSubmitting}
                />
                <Text style={styles.modalFieldLabel}>
                  {editTarget.is_receivable ? "Tahsil hedef tarihi" : "Odeme hedef tarihi"} (GG.AA.YYYY)
                </Text>
                <TextInput
                  style={styles.modalInputTight}
                  value={editDateInput}
                  onChangeText={setEditDateInput}
                  placeholder="GG.AA.YYYY veya bos"
                  placeholderTextColor="#666"
                  keyboardType="numbers-and-punctuation"
                  editable={!editSubmitting}
                />
              </>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={closeEditModal} disabled={editSubmitting}>
                <Text style={styles.modalCancelText}>Vazgec</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOkBtn} onPress={onSaveEdit} disabled={editSubmitting}>
                <Text style={styles.modalOkText}>{editSubmitting ? "Kaydediliyor..." : "Kaydet"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  content: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 32
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center"
  },
  muted: {
    color: COLORS.textLight
  },
  title: {
    color: COLORS.primary,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 8
  },
  subtitle: {
    color: "#888",
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18
  },
  errorText: {
    color: "#e85d5d",
    marginBottom: 12,
    fontSize: 13
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 22,
    backgroundColor: COLORS.card,
    alignItems: "center"
  },
  emptyText: {
    color: COLORS.textLight,
    fontSize: 14
  },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    padding: 14,
    marginBottom: 12
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  cardType: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "800"
  },
  cardDate: {
    color: "#888",
    fontSize: 12
  },
  cardParty: {
    color: COLORS.textLight,
    fontSize: 14,
    marginBottom: 10
  },
  cardAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6
  },
  cardAmountLabel: {
    color: "#888",
    fontSize: 13
  },
  cardAmountValue: {
    color: COLORS.textLight,
    fontSize: 13,
    fontWeight: "600"
  },
  cardAmountValueHighlight: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800"
  },
  paymentDueLine: {
    color: "#a8936a",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    lineHeight: 18
  },
  editOutlineBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    marginBottom: 8,
    backgroundColor: COLORS.black
  },
  editOutlineBtnText: {
    color: COLORS.textLight,
    fontSize: 13,
    fontWeight: "800"
  },
  dateChipBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    marginBottom: 8
  },
  dateChipBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800"
  },
  actionBtn: {
    marginTop: 4,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  actionBtnReceivable: {
    backgroundColor: COLORS.primary
  },
  actionBtnPayable: {
    backgroundColor: "#c45c3e"
  },
  actionBtnText: {
    color: COLORS.black,
    fontWeight: "800",
    fontSize: 14
  },
  actionBtnTextInverse: {
    color: "#ffffff"
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
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16
  },
  modalTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8
  },
  modalSubtitle: {
    color: COLORS.textLight,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12
  },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.primary,
    backgroundColor: COLORS.black,
    marginBottom: 16
  },
  editModalSheet: {
    maxHeight: "85%"
  },
  modalFieldLabel: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6
  },
  modalInputTight: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: COLORS.primary,
    backgroundColor: COLORS.black,
    marginBottom: 14
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginBottom: 10
  },
  modalActionsStack: {
    marginTop: 4
  },
  modalCancelBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  modalCancelText: {
    color: COLORS.textLight,
    fontWeight: "700",
    fontSize: 13
  },
  modalOkBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  modalOkText: {
    color: COLORS.black,
    fontWeight: "800",
    fontSize: 13
  }
});
