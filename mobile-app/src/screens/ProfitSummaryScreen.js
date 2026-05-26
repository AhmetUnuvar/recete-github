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
  TextInput
} from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";
import { deleteFixedRecord, getFixedRecords, updateFixedRecord } from "../services/financeService";
import {
  dismissNotification,
  getPendingNotificationsForPage,
  TARGET_PAGE_FIXED_MY_LIST
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

export default function ProfitSummaryScreen({ userId, onGoToAddFixedIncomeExpense, profitSummaryFocusNonce = 0 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [fixedListNotice, setFixedListNotice] = useState(null);
  const [fixedListNoticeModalOpen, setFixedListNoticeModalOpen] = useState(false);
  const [fixedListNoticeCloseLoading, setFixedListNoticeCloseLoading] = useState(false);
  const [dontShowFixedListNoticeAgain, setDontShowFixedListNoticeAgain] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setMessage("Giris yapilmamis.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      const data = await getFixedRecords(userId);
      setRows(data);
    } catch (error) {
      setRows([]);
      setMessage(error.message || "Kayitlar yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setFixedListNotice(null);
        setFixedListNoticeModalOpen(false);
        return;
      }
      try {
        const list = await getPendingNotificationsForPage({
          userId,
          targetPage: TARGET_PAGE_FIXED_MY_LIST
        });
        if (cancelled) return;
        const first = list[0];
        if (first?.id) {
          setFixedListNotice(first);
          setFixedListNoticeModalOpen(true);
        } else {
          setFixedListNotice(null);
          setFixedListNoticeModalOpen(false);
        }
      } catch (e) {
        if (__DEV__ && !cancelled) {
          console.warn("[ProfitSummaryScreen] Bildirim yuklenemedi:", e?.message || e);
        }
        if (!cancelled) {
          setFixedListNotice(null);
          setFixedListNoticeModalOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, profitSummaryFocusNonce]);

  useEffect(() => {
    setDontShowFixedListNoticeAgain(false);
  }, [fixedListNotice?.id]);

  const finalizeFixedListNoticeModal = useCallback(async () => {
    if (fixedListNoticeCloseLoading || !fixedListNotice) return;
    const shouldDismiss = dontShowFixedListNoticeAgain && userId && fixedListNotice?.id;
    try {
      if (shouldDismiss) setFixedListNoticeCloseLoading(true);
      if (shouldDismiss) await dismissNotification({ userId, notificationId: fixedListNotice.id });
    } catch (_e) {
      /* tekrar denenebilir */
    } finally {
      setFixedListNoticeCloseLoading(false);
      setFixedListNoticeModalOpen(false);
      if (shouldDismiss) setFixedListNotice(null);
    }
  }, [fixedListNoticeCloseLoading, fixedListNotice, dontShowFixedListNoticeAgain, userId]);

  const onRefresh = async () => {
    if (!userId) return;
    try {
      setRefreshing(true);
      const data = await getFixedRecords(userId);
      setRows(data);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Yenilenemedi.");
    } finally {
      setRefreshing(false);
    }
  };

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const r of rows) {
      const n = Number(r.amount);
      if (Number.isNaN(n)) continue;
      if (r.is_fixed_income) income += n;
      else expense += n;
    }
    return { income, expense, balance: income - expense };
  }, [rows]);

  const formatAmountDisplay = (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return "-";
    return n.toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  const formatAmountInput = (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return "";
    return String(parseFloat(n.toFixed(2)));
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setEditName(String(item.fixed_name || ""));
    setEditAmount(formatAmountInput(item.amount));
  };

  const closeEdit = () => {
    if (savingEdit) return;
    setEditingItem(null);
    setEditName("");
    setEditAmount("");
  };

  const onSaveEdit = async () => {
    if (!editingItem?.id || !userId) return;
    if (!editName.trim()) {
      Alert.alert("Uyari", "Adi bos olamaz.");
      return;
    }
    const parsed = Number(String(editAmount).replace(",", "."));
    if (Number.isNaN(parsed) || parsed <= 0) {
      Alert.alert("Uyari", "Miktar sifirdan buyuk sayi olmali.");
      return;
    }
    try {
      setSavingEdit(true);
      await updateFixedRecord({
        userId,
        fixedId: editingItem.id,
        fixedName: editName.trim(),
        amount: parsed
      });
      closeEdit();
      await load();
      Alert.alert("Basarili", "Kayit guncellendi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Kayit guncellenemedi.");
    } finally {
      setSavingEdit(false);
    }
  };

  const onDelete = (item) => {
    Alert.alert("Kaydi sil", `"${item.fixed_name}" kaydini silmek istiyor musunuz?`, [
      { text: "Vazgec", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteFixedRecord({ userId, fixedId: item.id });
            await load();
            Alert.alert("Silindi", "Kayit silindi.");
          } catch (error) {
            Alert.alert("Hata", error.message || "Kayit silinemedi.");
          }
        }
      }
    ]);
  };

  const renderFixedListNoticeModal = () => (
    <Modal
      visible={fixedListNoticeModalOpen && fixedListNotice != null}
      transparent
      animationType="fade"
      onRequestClose={finalizeFixedListNoticeModal}
    >
      <View style={styles.welcomeModalRoot}>
        <Pressable style={styles.welcomeModalBackdrop} onPress={finalizeFixedListNoticeModal} />
        <View style={styles.welcomeModalCard}>
          <View style={styles.welcomeModalAccent} />
          <Text style={styles.welcomeModalKicker}>BİLGİLENDİRME</Text>
          <Text style={styles.welcomeModalTitle}>{fixedListNotice?.title || ""}</Text>
          <ScrollView
            style={styles.welcomeModalScroll}
            contentContainerStyle={styles.welcomeModalScrollInner}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {parseNoticeMessage(fixedListNotice?.message).map((block, idx) => {
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
            onPress={() => setDontShowFixedListNoticeAgain((v) => !v)}
            activeOpacity={0.75}
            disabled={fixedListNoticeCloseLoading}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowFixedListNoticeAgain }}
          >
            <View
              style={[styles.welcomeCheckbox, dontShowFixedListNoticeAgain && styles.welcomeCheckboxOn]}
            >
              {dontShowFixedListNoticeAgain ? <Text style={styles.welcomeCheckboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.welcomeCheckboxLabel}>Bu bildirimi bir daha gösterme</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.welcomeOkBtn, fixedListNoticeCloseLoading && styles.welcomeOkBtnDisabled]}
            onPress={finalizeFixedListNoticeModal}
            disabled={fixedListNoticeCloseLoading}
            activeOpacity={0.88}
          >
            <Text style={styles.welcomeOkBtnText}>
              {fixedListNoticeCloseLoading ? "Kaydediliyor..." : "Tamam"}
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
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
      }
    >
      <View style={styles.pageTitleRow}>
        <Text style={[styles.title, styles.titleInHeader]} numberOfLines={2}>
          Sabit Gelir Giderlerim
        </Text>
        <PageHeaderRightActions>
          {typeof onGoToAddFixedIncomeExpense === "function" ? (
            <TouchableOpacity
              style={styles.addFixedBtn}
              onPress={onGoToAddFixedIncomeExpense}
              activeOpacity={0.85}
            >
              <Text style={styles.addFixedBtnText} numberOfLines={3}>
                Sabit gelir gider ekle
              </Text>
            </TouchableOpacity>
          ) : null}
        </PageHeaderRightActions>
      </View>
      {!userId ? <Text style={styles.messageText}>Kayitlari gormek icin giris yapin.</Text> : null}
      {message ? <Text style={styles.messageText}>{message}</Text> : null}

      <TouchableOpacity style={styles.refreshBtn} onPress={load}>
        <Text style={styles.refreshBtnText}>Listeyi yenile</Text>
      </TouchableOpacity>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryRow}>Toplam Gelir: {formatAmountDisplay(summary.income)}</Text>
        <Text style={styles.summaryRow}>Toplam Gider: {formatAmountDisplay(summary.expense)}</Text>
        <Text style={styles.summaryBalance}>Net: {formatAmountDisplay(summary.balance)}</Text>
      </View>

      {loading && rows.length === 0 ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
      ) : null}

      {rows.length === 0 && !loading ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Henuz sabit kayit yok</Text>
          <Text style={styles.emptyHint}>Sabit Gelir / Gider Ekle sayfasindan kayit ekleyebilirsiniz.</Text>
        </View>
      ) : (
        rows.map((item) => {
          const amountTxt = formatAmountDisplay(item.amount);
          return (
            <View key={item.id} style={styles.card}>
              <Text style={styles.cardTitle}>{item.fixed_name || "-"}</Text>
              <Text style={styles.cardMeta}>{item.is_fixed_income ? "Gelir" : "Gider"}</Text>
              <Text style={styles.cardAmount}>{amountTxt}</Text>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                  <Text style={styles.editBtnText}>Duzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item)}>
                  <Text style={styles.deleteBtnText}>Sil</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
    {renderFixedListNoticeModal()}
    <Modal visible={editingItem != null} transparent animationType="fade" onRequestClose={closeEdit}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={closeEdit} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Kaydi Duzenle</Text>
          <Text style={styles.label}>Ad</Text>
          <TextInput
            style={styles.input}
            value={editName}
            onChangeText={setEditName}
            placeholder="Ad"
            placeholderTextColor="#666"
          />
          <Text style={styles.label}>Miktar</Text>
          <TextInput
            style={styles.input}
            value={editAmount}
            onChangeText={setEditAmount}
            placeholder="Miktar"
            placeholderTextColor="#666"
            keyboardType="decimal-pad"
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={closeEdit} disabled={savingEdit}>
              <Text style={styles.cancelBtnText}>Iptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={onSaveEdit} disabled={savingEdit}>
              <Text style={styles.saveBtnText}>{savingEdit ? "Kaydediliyor..." : "Kaydet"}</Text>
            </TouchableOpacity>
          </View>
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
    paddingHorizontal: HORIZONTAL_PADDING
  },
  pageTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 8,
    marginBottom: 10
  },
  title: {
    color: COLORS.primary,
    fontSize: 28,
    fontWeight: "800"
  },
  titleInHeader: { flex: 1, flexShrink: 1, marginBottom: 0 },
  addFixedBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignSelf: "flex-start",
    maxWidth: "50%"
  },
  addFixedBtnText: {
    color: COLORS.black,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center"
  },
  messageText: {
    color: COLORS.textLight,
    fontSize: 13,
    marginBottom: 8
  },
  refreshBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12
  },
  refreshBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700"
  },
  summaryBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    padding: 12,
    marginBottom: 12
  },
  summaryRow: {
    color: COLORS.textLight,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4
  },
  summaryBalance: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2
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
  cardTitle: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "700"
  },
  cardMeta: {
    color: COLORS.textLight,
    fontSize: 12,
    marginTop: 6
  },
  cardAmount: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 8
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  editBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10
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
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  deleteBtnText: {
    color: "#d9534f",
    fontSize: 12,
    fontWeight: "700"
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
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14
  },
  modalTitle: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10
  },
  label: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 10,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10
  },
  modalActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
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
  saveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12
  },
  saveBtnText: {
    color: COLORS.black,
    fontSize: 12,
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
