import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator
} from "react-native";
import { COLORS } from "../constants/colors";
import PageTitleRow from "../components/PageTitleRow";
import {
  addSharedMemberByReferenceCode,
  getSharedMembers,
  removeSharedMember
} from "../services/authService";

const formatMemberName = (row) => {
  const n = [row?.name, row?.lastname].filter(Boolean).join(" ").trim();
  return n || row?.email || "Kullanici";
};

export default function AddSharedUserScreen({ ownerUserId, onMembersChanged }) {
  const [referenceCode, setReferenceCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!ownerUserId) return;
    try {
      setLoadingMembers(true);
      const rows = await getSharedMembers();
      setMembers(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [ownerUserId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const onAddUser = async () => {
    const code = String(referenceCode || "").trim().toUpperCase();
    if (!code) {
      Alert.alert("Uyari", "Lutfen referans kodunu girin.");
      return;
    }
    if (!ownerUserId) {
      Alert.alert("Uyari", "Oturum bulunamadi. Lutfen tekrar giris yapin.");
      return;
    }

    try {
      setSubmitting(true);
      await addSharedMemberByReferenceCode(code);
      setReferenceCode("");
      await loadMembers();
      if (typeof onMembersChanged === "function") {
        onMembersChanged();
      }
      Alert.alert("Basarili", "Calisan eklendi. Giris yaptiginda isletmenizin verilerini gorecek.");
    } catch (error) {
      Alert.alert("Hata", error.message || "Calisan eklenemedi.");
    } finally {
      setSubmitting(false);
    }
  };

  const onRemoveMember = (row) => {
    if (!row?.access_id) return;
    Alert.alert(
      "Kaldir",
      `${formatMemberName(row)} kullanicisinin erisimini kaldirmak istiyor musunuz?`,
      [
        { text: "Vazgec", style: "cancel" },
        {
          text: "Kaldir",
          style: "destructive",
          onPress: async () => {
            try {
              await removeSharedMember(row.access_id);
              await loadMembers();
              if (typeof onMembersChanged === "function") {
                onMembersChanged();
              }
              Alert.alert("Tamam", "Calisanin erisimi kaldirildi.");
            } catch (error) {
              Alert.alert("Hata", error.message || "Kaldirilamadi.");
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <PageTitleRow title="Calisan Ekle" titleStyle={styles.title} />

      <Text style={styles.lead}>
        Eklediginiz calisan sizin stok, urun, musteri ve tum islemlerinizi gorur; kendi isletme hesabi olmadan
        sizin adiniza calisir.
      </Text>

      <TextInput
        style={styles.input}
        value={referenceCode}
        onChangeText={setReferenceCode}
        placeholder="Referans kodu ekle"
        placeholderTextColor="#666"
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!submitting}
      />

      <TouchableOpacity
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={onAddUser}
        disabled={submitting}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color={COLORS.black} />
        ) : (
          <Text style={styles.buttonText}>Calisan Ekle</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.hint}>
        Calisanin kendi profil sayfasindaki referans kodunu sizinle paylasmasi gerekir. O kodu buraya girin.
      </Text>

      <Text style={styles.sectionTitle}>Ekli calisanlar</Text>
      {loadingMembers ? (
        <ActivityIndicator color={COLORS.primary} style={styles.loader} />
      ) : members.length === 0 ? (
        <Text style={styles.emptyText}>Henuz calisan eklenmedi.</Text>
      ) : (
        members.map((row) => (
          <View key={row.access_id} style={styles.memberRow}>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{formatMemberName(row)}</Text>
              <Text style={styles.memberMeta}>{row.email || "-"}</Text>
              {row.reference_code ? (
                <Text style={styles.memberMeta}>Ref: {row.reference_code}</Text>
              ) : null}
            </View>
            <TouchableOpacity style={styles.removeBtn} onPress={() => onRemoveMember(row)}>
              <Text style={styles.removeBtnText}>Kaldir</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  content: {
    paddingBottom: 32
  },
  title: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "800"
  },
  lead: {
    color: COLORS.textLight,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    color: COLORS.textLight,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 16,
    fontSize: 15
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 20
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "800"
  },
  hint: {
    color: "#9a9a9a",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24
  },
  sectionTitle: {
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12
  },
  loader: {
    marginVertical: 12
  },
  emptyText: {
    color: "#888",
    fontSize: 14
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    padding: 12,
    marginBottom: 10,
    gap: 10
  },
  memberInfo: {
    flex: 1
  },
  memberName: {
    color: COLORS.textLight,
    fontSize: 15,
    fontWeight: "700"
  },
  memberMeta: {
    color: "#9a9a9a",
    fontSize: 12,
    marginTop: 2
  },
  removeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ff5d5d"
  },
  removeBtnText: {
    color: "#ff5d5d",
    fontSize: 13,
    fontWeight: "700"
  }
});
