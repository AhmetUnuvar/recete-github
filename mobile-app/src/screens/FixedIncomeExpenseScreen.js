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
  Alert
} from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";
import { createFixedRecord, getFixedRecords } from "../services/financeService";
import {
  dismissNotification,
  getPendingNotificationsForPage,
  TARGET_PAGE_FIXED_INCOME_EXPENSE
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

export default function FixedIncomeExpenseScreen({ userId, fixedIncomeExpenseFocusNonce = 0 }) {
  const [selectedType, setSelectedType] = useState("income");
  const [fixedName, setFixedName] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [defaultIncomeRows, setDefaultIncomeRows] = useState([]);
  const [fixedNotice, setFixedNotice] = useState(null);
  const [fixedNoticeModalOpen, setFixedNoticeModalOpen] = useState(false);
  const [fixedNoticeCloseLoading, setFixedNoticeCloseLoading] = useState(false);
  const [dontShowFixedNoticeAgain, setDontShowFixedNoticeAgain] = useState(false);

  const labels = useMemo(() => {
    if (selectedType === "income") {
      return {
        name: "Gelir Adi",
        amount: "Gelir Miktari",
        button: "Sabit Gelir Ekle"
      };
    }

    return {
      name: "Gider Adi",
      amount: "Gider Miktari",
      button: "Sabit Gider Ekle"
    };
  }, [selectedType]);

  const loadDefaultIncomeHints = useCallback(async () => {
    if (!userId) {
      setDefaultIncomeRows([]);
      return;
    }
    try {
      const rows = await getFixedRecords(userId);
      setDefaultIncomeRows(
        rows.filter((r) => r.is_fixed_income === true && r.is_default === true)
      );
    } catch (_err) {
      setDefaultIncomeRows([]);
    }
  }, [userId]);

  useEffect(() => {
    loadDefaultIncomeHints();
  }, [loadDefaultIncomeHints]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setFixedNotice(null);
        setFixedNoticeModalOpen(false);
        return;
      }
      try {
        const list = await getPendingNotificationsForPage({
          userId,
          targetPage: TARGET_PAGE_FIXED_INCOME_EXPENSE
        });
        if (cancelled) return;
        const first = list[0];
        if (first?.id) {
          setFixedNotice(first);
          setFixedNoticeModalOpen(true);
        } else {
          setFixedNotice(null);
          setFixedNoticeModalOpen(false);
        }
      } catch (e) {
        if (__DEV__ && !cancelled) {
          console.warn("[FixedIncomeExpenseScreen] Bildirim yuklenemedi:", e?.message || e);
        }
        if (!cancelled) {
          setFixedNotice(null);
          setFixedNoticeModalOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, fixedIncomeExpenseFocusNonce]);

  useEffect(() => {
    setDontShowFixedNoticeAgain(false);
  }, [fixedNotice?.id]);

  const finalizeFixedNoticeModal = useCallback(async () => {
    if (fixedNoticeCloseLoading || !fixedNotice) return;
    const shouldDismiss = dontShowFixedNoticeAgain && userId && fixedNotice?.id;
    try {
      if (shouldDismiss) setFixedNoticeCloseLoading(true);
      if (shouldDismiss) await dismissNotification({ userId, notificationId: fixedNotice.id });
    } catch (_e) {
      /* tekrar denenebilir */
    } finally {
      setFixedNoticeCloseLoading(false);
      setFixedNoticeModalOpen(false);
      if (shouldDismiss) setFixedNotice(null);
    }
  }, [fixedNoticeCloseLoading, fixedNotice, dontShowFixedNoticeAgain, userId]);

  const onSubmit = async () => {
    if (!userId) {
      Alert.alert("Uyari", "Kayit icin giris yapmaniz gerekiyor.");
      return;
    }
    if (!fixedName.trim()) {
      Alert.alert("Uyari", `${labels.name} bos olamaz.`);
      return;
    }
    const parsedAmount = Number(String(amount).replace(",", "."));
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Uyari", "Miktar sifirdan buyuk sayi olmali.");
      return;
    }
    try {
      setSaving(true);
      await createFixedRecord({
        userId,
        fixedName: fixedName.trim(),
        isFixedIncome: selectedType === "income",
        amount: parsedAmount
      });
      setFixedName("");
      setAmount("");
      await loadDefaultIncomeHints();
      Alert.alert("Basarili", "Sabit eklendi.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Kayit yapilamadi.");
    } finally {
      setSaving(false);
    }
  };

  const renderFixedNoticeModal = () => (
    <Modal
      visible={fixedNoticeModalOpen && fixedNotice != null}
      transparent
      animationType="fade"
      onRequestClose={finalizeFixedNoticeModal}
    >
      <View style={styles.welcomeModalRoot}>
        <Pressable style={styles.welcomeModalBackdrop} onPress={finalizeFixedNoticeModal} />
        <View style={styles.welcomeModalCard}>
          <View style={styles.welcomeModalAccent} />
          <Text style={styles.welcomeModalKicker}>BİLGİLENDİRME</Text>
          <Text style={styles.welcomeModalTitle}>{fixedNotice?.title || ""}</Text>
          <ScrollView
            style={styles.welcomeModalScroll}
            contentContainerStyle={styles.welcomeModalScrollInner}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {parseNoticeMessage(fixedNotice?.message).map((block, idx) => {
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
            onPress={() => setDontShowFixedNoticeAgain((v) => !v)}
            activeOpacity={0.75}
            disabled={fixedNoticeCloseLoading}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: dontShowFixedNoticeAgain }}
          >
            <View style={[styles.welcomeCheckbox, dontShowFixedNoticeAgain && styles.welcomeCheckboxOn]}>
              {dontShowFixedNoticeAgain ? <Text style={styles.welcomeCheckboxTick}>✓</Text> : null}
            </View>
            <Text style={styles.welcomeCheckboxLabel}>Bu bildirimi bir daha gösterme</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.welcomeOkBtn, fixedNoticeCloseLoading && styles.welcomeOkBtnDisabled]}
            onPress={finalizeFixedNoticeModal}
            disabled={fixedNoticeCloseLoading}
            activeOpacity={0.88}
          >
            <Text style={styles.welcomeOkBtnText}>
              {fixedNoticeCloseLoading ? "Kaydediliyor..." : "Tamam"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Sabit Gelir / Gider Ekle</Text>
        <Text style={styles.introText}>
          Buraya eklediğiniz aylık gider ve gelirler günlük olarak hesabınıza etki eder.
        </Text>

        <View style={styles.switchRow}>
          <TouchableOpacity
            style={[styles.switchButton, selectedType === "income" && styles.switchButtonActive]}
            onPress={() => setSelectedType("income")}
          >
            <Text
              style={[
                styles.switchButtonText,
                selectedType === "income" && styles.switchButtonTextActive
              ]}
            >
              Gelir
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.switchButton, selectedType === "expense" && styles.switchButtonActive]}
            onPress={() => setSelectedType("expense")}
          >
            <Text
              style={[
                styles.switchButtonText,
                selectedType === "expense" && styles.switchButtonTextActive
              ]}
            >
              Gider
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>{labels.name}</Text>
        <TextInput
          style={styles.input}
          placeholder={labels.name}
          placeholderTextColor="#666"
          value={fixedName}
          onChangeText={setFixedName}
        />

        <Text style={styles.label}>{labels.amount}</Text>
        <TextInput
          style={styles.input}
          placeholder={labels.amount}
          placeholderTextColor="#666"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />

        <TouchableOpacity style={styles.submitButton} onPress={onSubmit} disabled={saving}>
          <Text style={styles.submitButtonText}>{saving ? "Kaydediliyor..." : labels.button}</Text>
        </TouchableOpacity>

        {selectedType === "income" && defaultIncomeRows.length > 0 ? (
          <View style={styles.defaultHintsWrap}>
            {defaultIncomeRows.map((row) => (
              <Text key={row.id} style={styles.defaultHintName}>
                {row.fixed_name}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
      {renderFixedNoticeModal()}
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
  title: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 10
  },
  introText: {
    color: COLORS.textLight,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    marginBottom: 16
  },
  switchRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16
  },
  switchButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center"
  },
  switchButtonActive: {
    backgroundColor: COLORS.primary
  },
  switchButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: "700"
  },
  switchButtonTextActive: {
    color: COLORS.black
  },
  label: {
    color: COLORS.textLight,
    fontSize: 14,
    marginBottom: 7,
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
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
    marginBottom: 16
  },
  submitButtonText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "800"
  },
  defaultHintsWrap: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border
  },
  defaultHintName: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8
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
