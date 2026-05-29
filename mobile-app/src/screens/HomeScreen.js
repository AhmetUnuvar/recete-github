import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  Alert
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";
import { createTransaction, getTransactions } from "../services/transactionsService";
import {
  dismissNotification,
  getPendingNotificationsForPage,
  TARGET_PAGE_HOME
} from "../services/notificationService";

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

const formatTransactionDateTime = (raw) => {
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) {
    return { date: "-", time: "-", day: "-" };
  }
  return {
    date: dt.toLocaleDateString("tr-TR"),
    time: dt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    day: dt.toLocaleDateString("tr-TR", { weekday: "long" })
  };
};

export default function HomeScreen({
  userId,
  transactionsRefreshNonce = 0,
  homeFocusNonce = 0,
  onTransactionsMutated
}) {
  const [period, setPeriod] = useState("daily");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [welcomeNotif, setWelcomeNotif] = useState(null);
  const [welcomeModalOpen, setWelcomeModalOpen] = useState(false);
  const [welcomeCloseLoading, setWelcomeCloseLoading] = useState(false);
  const [dontShowWelcomeAgain, setDontShowWelcomeAgain] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [incomeName, setIncomeName] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [savingTxn, setSavingTxn] = useState(false);

  const periodOptions = [
    { key: "daily", label: "Gunluk Kar/Zarar" },
    { key: "weekly", label: "Haftalik Kar/Zarar" },
    { key: "monthly", label: "Aylik Kar/Zarar" },
    { key: "yearly", label: "Yillik Kar/Zarar" }
  ];

  const reloadTransactions = useCallback(async () => {
    if (!userId) {
      setTransactions([]);
      setMessage("Giris yapilmamis.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      const rows = await getTransactions(userId, 1000);
      setTransactions(rows);
    } catch (error) {
      setTransactions([]);
      setMessage(error.message || "Islemler yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reloadTransactions();
  }, [reloadTransactions, transactionsRefreshNonce]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reloadTransactions();
    setRefreshing(false);
  }, [reloadTransactions]);

  const submitStandaloneIncome = async () => {
    const amount = Number(String(incomeAmount || "").replace(",", "."));
    const name = String(incomeName || "").trim();
    if (!userId) {
      Alert.alert("Uyari", "Giris yapmaniz gerekiyor.");
      return;
    }
    if (Number.isNaN(amount) || amount <= 0 || !name) {
      Alert.alert("Uyari", "Gelir adi ve gecerli bir tutar giriniz.");
      return;
    }
    try {
      setSavingTxn(true);
      await createTransaction({
        userId,
        amount,
        isIncome: true,
        buyerId: null,
        transactionName: name
      });
      setShowIncomeModal(false);
      setIncomeName("");
      setIncomeAmount("");
      await reloadTransactions();
      if (typeof onTransactionsMutated === "function") {
        onTransactionsMutated();
      }
      Alert.alert("Basarili", "Gelir kaydedildi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Gelir kaydedilemedi.");
    } finally {
      setSavingTxn(false);
    }
  };

  const submitStandaloneExpense = async () => {
    const amount = Number(String(expenseAmount || "").replace(",", "."));
    const name = String(expenseName || "").trim();
    if (!userId) {
      Alert.alert("Uyari", "Giris yapmaniz gerekiyor.");
      return;
    }
    if (Number.isNaN(amount) || amount <= 0 || !name) {
      Alert.alert("Uyari", "Gider adi ve gecerli bir tutar giriniz.");
      return;
    }
    try {
      setSavingTxn(true);
      await createTransaction({
        userId,
        amount,
        isIncome: false,
        buyerId: null,
        transactionName: name
      });
      setShowExpenseModal(false);
      setExpenseName("");
      setExpenseAmount("");
      await reloadTransactions();
      if (typeof onTransactionsMutated === "function") {
        onTransactionsMutated();
      }
      Alert.alert("Basarili", "Gider kaydedildi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Gider kaydedilemedi.");
    } finally {
      setSavingTxn(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setWelcomeNotif(null);
        setWelcomeModalOpen(false);
        return;
      }
      try {
        const list = await getPendingNotificationsForPage({ userId, targetPage: TARGET_PAGE_HOME });
        if (cancelled) return;
        const first = list[0];
        if (first?.id) {
          setWelcomeNotif(first);
          setWelcomeModalOpen(true);
        } else {
          setWelcomeNotif(null);
          setWelcomeModalOpen(false);
        }
      } catch (e) {
        if (__DEV__ && !cancelled) {
          console.warn("[HomeScreen] Bildirim yuklenemedi:", e?.message || e);
        }
        if (!cancelled) {
          setWelcomeNotif(null);
          setWelcomeModalOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, homeFocusNonce]);

  useEffect(() => {
    setDontShowWelcomeAgain(false);
  }, [welcomeNotif?.id]);

  const finalizeWelcomeModal = async () => {
    if (welcomeCloseLoading || !welcomeNotif) return;
    const shouldDismiss = dontShowWelcomeAgain && userId && welcomeNotif?.id;
    try {
      if (shouldDismiss) setWelcomeCloseLoading(true);
      if (shouldDismiss) await dismissNotification({ userId, notificationId: welcomeNotif.id });
    } catch (_e) {
      /* seçildiyse tekrar ana sayfa gelince denenebilir */
    } finally {
      setWelcomeCloseLoading(false);
      setWelcomeModalOpen(false);
      if (shouldDismiss) setWelcomeNotif(null);
    }
  };

  const chartData = useMemo(() => {
    const now = new Date();
    const startFor = {
      daily: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
      weekly: (() => {
        const d = new Date(now);
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1;
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - diff);
        return d;
      })(),
      monthly: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      yearly: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
    };
    const out = {
      daily: { income: 0, expense: 0 },
      weekly: { income: 0, expense: 0 },
      monthly: { income: 0, expense: 0 },
      yearly: { income: 0, expense: 0 }
    };
    for (const t of transactions) {
      const n = Number(t.amount);
      if (Number.isNaN(n)) continue;
      const dt = new Date(t.transaction_time || t.created_at);
      if (Number.isNaN(dt.getTime())) continue;
      for (const key of Object.keys(startFor)) {
        if (dt >= startFor[key] && dt <= now) {
          if (t.is_income) out[key].income += n;
          else out[key].expense += n;
        }
      }
    }
    return out;
  }, [transactions]);

  const recentTransactions = useMemo(() => {
    const sorted = [...transactions].sort(
      (a, b) => new Date(b.transaction_time || b.created_at) - new Date(a.transaction_time || a.created_at)
    );
    return sorted.slice(0, 5).map((item) => {
      const n = Number(item.amount);
      const amountTxt = Number.isNaN(n)
        ? "-"
        : `${item.is_income ? "+" : "-"}${n.toLocaleString("tr-TR", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
          })} TL`;
      const { date, time, day } = formatTransactionDateTime(
        item.transaction_time || item.created_at
      );
      const txTitle = item.product_name
        ? `Urun Satisi: ${item.product_name}`
        : item.transaction_name || (item.is_income ? "Gelir islemi" : "Gider islemi");
      return {
        id: item.id,
        type: item.is_income ? "income" : "expense",
        title: txTitle,
        amount: amountTxt,
        date,
        time,
        day
      };
    });
  }, [transactions]);

  const selectedData = chartData[period];
  const total = selectedData.income + selectedData.expense;
  const netProfit = selectedData.income - selectedData.expense;
  const netProfitLabel = netProfit >= 0 ? "Kar" : "Zarar";
  const incomeRatio = total > 0 ? selectedData.income / total : 0;
  const expenseRatio = total > 0 ? selectedData.expense / total : 0;

  const size = 190;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const incomeLength = circumference * incomeRatio;
  const expenseLength = circumference * expenseRatio;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
      }
    >
      <Text style={styles.title}>Ana Sayfa</Text>

      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={[styles.quickActionBtn, styles.incomeQuickBtn]}
          onPress={() => {
            if (!userId) {
              Alert.alert("Uyari", "Giris yapmaniz gerekiyor.");
              return;
            }
            setShowIncomeModal(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.quickActionBtnText}>Gelir Ekle</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickActionBtn, styles.expenseQuickBtn]}
          onPress={() => {
            if (!userId) {
              Alert.alert("Uyari", "Giris yapmaniz gerekiyor.");
              return;
            }
            setShowExpenseModal(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.quickActionBtnText}>Gider Ekle</Text>
        </TouchableOpacity>
      </View>

      {message ? <Text style={styles.infoText}>{message}</Text> : null}
      {loading ? <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader} /> : null}
      <View style={styles.chartCard}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.periodTabs}
        >
          {periodOptions.map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => setPeriod(item.key)}
              style={[styles.periodChip, period === item.key && styles.periodChipActive]}
            >
              <Text
                style={[
                  styles.periodChipText,
                  period === item.key && styles.periodChipTextActive
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.chartArea}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={COLORS.border}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#42d96b"
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={`${incomeLength} ${circumference}`}
              strokeDashoffset={0}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#ff5f5f"
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={`${expenseLength} ${circumference}`}
              strokeDashoffset={-incomeLength}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>
          <View style={styles.chartCenter}>
            <Text style={styles.totalLabel}>{netProfitLabel}</Text>
            <Text
              style={[
                styles.totalValue,
                netProfit >= 0 ? styles.incomeText : styles.expenseText
              ]}
            >
              {Math.abs(netProfit).toLocaleString("tr-TR")} TL
            </Text>
          </View>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#42d96b" }]} />
            <View>
              <Text style={styles.legendTitle}>Gelir</Text>
              <Text style={styles.incomeText}>{selectedData.income.toLocaleString("tr-TR")} TL</Text>
            </View>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#ff5f5f" }]} />
            <View>
              <Text style={styles.legendTitle}>Gider</Text>
              <Text style={styles.expenseText}>{selectedData.expense.toLocaleString("tr-TR")} TL</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.transactionsCard}>
        <Text style={styles.sectionTitle}>Son 5 Islem</Text>
        {recentTransactions.map((item) => (
          <View key={item.id} style={styles.transactionRow}>
            <View>
              <Text style={styles.transactionTitle}>{item.title}</Text>
              <Text style={styles.transactionDate}>
                {item.date} · {item.time}
              </Text>
              <Text style={styles.transactionDay}>{item.day}</Text>
            </View>
            <Text
              style={[
                styles.transactionAmount,
                item.type === "income" ? styles.incomeText : styles.expenseText
              ]}
            >
              {item.amount}
            </Text>
          </View>
        ))}
        {recentTransactions.length === 0 ? (
          <Text style={styles.transactionDate}>Henuz islem yok.</Text>
        ) : null}
      </View>

      <Modal
        visible={showIncomeModal}
        transparent
        animationType="fade"
        onRequestClose={() => !savingTxn && setShowIncomeModal(false)}
      >
        <View style={styles.txModalRoot}>
          <Pressable
            style={styles.txModalBackdrop}
            onPress={() => !savingTxn && setShowIncomeModal(false)}
          />
          <View style={styles.txModalSheet}>
            <Text style={styles.txModalTitle}>Gelir Ekle</Text>
            <Text style={styles.txModalHint}>Musteri veya urun satisi olmadan genel gelir kaydi.</Text>
            <TextInput
              style={styles.txInput}
              value={incomeName}
              onChangeText={setIncomeName}
              placeholder="Gelir adi (orn: Nakit tahsilat)"
              placeholderTextColor="#666"
            />
            <TextInput
              style={styles.txInput}
              value={incomeAmount}
              onChangeText={setIncomeAmount}
              placeholder="Tutar"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={styles.txSaveBtn}
              onPress={submitStandaloneIncome}
              disabled={savingTxn}
            >
              <Text style={styles.txSaveBtnText}>{savingTxn ? "Kaydediliyor..." : "Kaydet"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showExpenseModal}
        transparent
        animationType="fade"
        onRequestClose={() => !savingTxn && setShowExpenseModal(false)}
      >
        <View style={styles.txModalRoot}>
          <Pressable
            style={styles.txModalBackdrop}
            onPress={() => !savingTxn && setShowExpenseModal(false)}
          />
          <View style={styles.txModalSheet}>
            <Text style={styles.txModalTitle}>Gider Ekle</Text>
            <Text style={styles.txModalHint}>Musteri veya stok islemi olmadan genel gider kaydi.</Text>
            <TextInput
              style={styles.txInput}
              value={expenseName}
              onChangeText={setExpenseName}
              placeholder="Gider adi (orn: Kira odemesi)"
              placeholderTextColor="#666"
            />
            <TextInput
              style={styles.txInput}
              value={expenseAmount}
              onChangeText={setExpenseAmount}
              placeholder="Tutar"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={styles.txSaveBtn}
              onPress={submitStandaloneExpense}
              disabled={savingTxn}
            >
              <Text style={styles.txSaveBtnText}>{savingTxn ? "Kaydediliyor..." : "Kaydet"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={welcomeModalOpen && welcomeNotif != null} transparent animationType="fade">
        <View style={styles.welcomeModalRoot}>
          <Pressable style={styles.welcomeModalBackdrop} onPress={finalizeWelcomeModal} />
          <View style={styles.welcomeModalCard}>
            <View style={styles.welcomeModalAccent} />
            <Text style={styles.welcomeModalKicker}>BİLGİLENDİRME</Text>
            <Text style={styles.welcomeModalTitle}>{welcomeNotif?.title || ""}</Text>
            <ScrollView
              style={styles.welcomeModalScroll}
              contentContainerStyle={styles.welcomeModalScrollInner}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {parseNoticeMessage(welcomeNotif?.message).map((block, idx) => {
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
              onPress={() => setDontShowWelcomeAgain((v) => !v)}
              activeOpacity={0.75}
              disabled={welcomeCloseLoading}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dontShowWelcomeAgain }}
            >
              <View style={[styles.welcomeCheckbox, dontShowWelcomeAgain && styles.welcomeCheckboxOn]}>
                {dontShowWelcomeAgain ? (
                  <Text style={styles.welcomeCheckboxTick}>✓</Text>
                ) : null}
              </View>
              <Text style={styles.welcomeCheckboxLabel}>Bu bildirimi bir daha gösterme</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.welcomeOkBtn, welcomeCloseLoading && styles.welcomeOkBtnDisabled]}
              onPress={finalizeWelcomeModal}
              disabled={welcomeCloseLoading}
              activeOpacity={0.88}
            >
              <Text style={styles.welcomeOkBtnText}>
                {welcomeCloseLoading ? "Kaydediliyor..." : "Tamam"}
              </Text>
            </TouchableOpacity>
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
  scrollContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 24
  },
  title: {
    color: COLORS.primary,
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 14
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14
  },
  quickActionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1.5
  },
  incomeQuickBtn: {
    borderColor: "#42d96b",
    backgroundColor: "rgba(66, 217, 107, 0.12)"
  },
  expenseQuickBtn: {
    borderColor: "#ff5f5f",
    backgroundColor: "rgba(255, 95, 95, 0.12)"
  },
  quickActionBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700"
  },
  txModalRoot: {
    flex: 1,
    justifyContent: "center"
  },
  txModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  txModalSheet: {
    marginHorizontal: HORIZONTAL_PADDING,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16
  },
  txModalTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6
  },
  txModalHint: {
    color: COLORS.textLight,
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 17
  },
  txInput: {
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
  txSaveBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  txSaveBtnText: {
    color: COLORS.black,
    fontSize: 14,
    fontWeight: "800"
  },
  infoText: {
    color: COLORS.textLight,
    fontSize: 12,
    marginBottom: 8
  },
  loader: {
    marginBottom: 8
  },
  chartCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 12,
    marginBottom: 14
  },
  periodTabs: {
    paddingHorizontal: 12,
    gap: 8
  },
  periodChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8
  },
  periodChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary
  },
  periodChipText: {
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: "600"
  },
  periodChipTextActive: {
    color: COLORS.black
  },
  chartArea: {
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 16,
    paddingBottom: 12
  },
  chartCenter: {
    position: "absolute",
    alignItems: "center"
  },
  totalLabel: {
    color: COLORS.textLight,
    opacity: 0.8,
    fontSize: 12
  },
  totalValue: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 3
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 10
  },
  legendItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.black,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8
  },
  legendTitle: {
    color: COLORS.textLight,
    fontSize: 12
  },
  transactionsCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10
  },
  sectionTitle: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border
  },
  transactionTitle: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600"
  },
  transactionDate: {
    color: COLORS.textLight,
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2
  },
  transactionDay: {
    color: COLORS.textLight,
    fontSize: 11,
    opacity: 0.65,
    marginTop: 1,
    textTransform: "capitalize"
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: "700"
  },
  incomeText: {
    color: "#62d26f"
  },
  expenseText: {
    color: "#ff6d6d"
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
