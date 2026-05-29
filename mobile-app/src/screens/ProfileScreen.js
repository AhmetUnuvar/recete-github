import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator
} from "react-native";
import { COLORS } from "../constants/colors";
import PageTitleRow from "../components/PageTitleRow";
import { HORIZONTAL_PADDING } from "../constants/layout";
import { changePassword, getMe } from "../services/authService";

export default function ProfileScreen({ email, userId, onLogout, isBusinessOwner = true }) {
  const safeEmail = String(email || "").trim();
  const [referenceCode, setReferenceCode] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!userId) {
        setReferenceCode("");
        setProfileLoading(false);
        return;
      }
      try {
        setProfileLoading(true);
        const me = await getMe();
        if (!alive) return;
        setReferenceCode(String(me?.reference_code || "").trim());
      } catch {
        if (!alive) return;
        setReferenceCode("");
      } finally {
        if (alive) setProfileLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const handleChangePassword = async () => {
    if (!userId) {
      Alert.alert("Uyari", "Oturum bulunamadi.");
      return;
    }
    if (!currentPassword.trim()) {
      Alert.alert("Uyari", "Mevcut sifrenizi girin.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Uyari", "Yeni sifre en az 6 karakter olmali.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Uyari", "Yeni sifre ile tekrar ayni olmali.");
      return;
    }
    if (currentPassword === newPassword) {
      Alert.alert("Uyari", "Yeni sifre mevcut sifreden farkli olmali.");
      return;
    }

    try {
      setSavingPassword(true);
      await changePassword({
        user_id: userId,
        current_password: currentPassword,
        new_password: newPassword
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Tamam", "Sifreniz guncellendi.");
    } catch (e) {
      Alert.alert("Hata", e.message || "Sifre guncellenemedi.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <PageTitleRow title="Profil" titleStyle={styles.title} />

      <Text style={styles.label}>E-posta</Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>{safeEmail || "-"}</Text>
      </View>

      <Text style={styles.label}>Referans kodunuz</Text>
      <View style={styles.infoBox}>
        {profileLoading ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <Text style={styles.referenceCodeText} selectable>
            {referenceCode || "-"}
          </Text>
        )}
      </View>
      {isBusinessOwner ? (
        <Text style={styles.hintMuted}>
          Bu kodu baska bir isletme sahibine vererek o kisi sizin verilerinize erisebilir. Ya da Calisan Ekle
          ekranindan calisan referans kodunu girerek calisaninizi ekleyin.
        </Text>
      ) : (
        <Text style={styles.hintMuted}>
          Bu kodu isletme sahibine verin. Sahip sizi "Calisan Ekle" ekraninda bu kodu girerek ekleyecektir;
          giris yaptiginizda otomatik olarak isletme verilerini goreceksiniz.
        </Text>
      )}

      <Text style={styles.sectionTitle}>Sifre guncelle</Text>
      <Text style={styles.hintMuted}>Mevcut sifrenizi dogrulayarak yeni sifre belirleyebilirsiniz.</Text>

      <Text style={styles.label}>Mevcut sifre</Text>
      <TextInput
        style={styles.input}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        placeholder="Mevcut sifre"
        placeholderTextColor="#666"
        secureTextEntry
        autoCapitalize="none"
        editable={!savingPassword}
      />

      <Text style={styles.label}>Yeni sifre</Text>
      <TextInput
        style={styles.input}
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder="En az 6 karakter"
        placeholderTextColor="#666"
        secureTextEntry
        autoCapitalize="none"
        editable={!savingPassword}
      />

      <Text style={styles.label}>Yeni sifre tekrar</Text>
      <TextInput
        style={styles.input}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Yeni sifreyi tekrar girin"
        placeholderTextColor="#666"
        secureTextEntry
        autoCapitalize="none"
        editable={!savingPassword}
      />

      <TouchableOpacity
        style={[styles.primaryBtn, savingPassword && styles.primaryBtnDisabled]}
        onPress={handleChangePassword}
        disabled={savingPassword}
        activeOpacity={0.88}
      >
        {savingPassword ? (
          <ActivityIndicator color={COLORS.black} />
        ) : (
          <Text style={styles.primaryBtnText}>Sifreyi guncelle</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => {
          if (typeof onLogout === "function") onLogout();
        }}
        activeOpacity={0.88}
      >
        <Text style={styles.logoutButtonText}>Cikis Yap</Text>
      </TouchableOpacity>
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
    paddingBottom: 28
  },
  title: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 18
  },
  sectionTitle: {
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 6
  },
  hintMuted: {
    color: COLORS.textLight,
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 19
  },
  label: {
    color: COLORS.textLight,
    fontSize: 14,
    marginBottom: 7,
    fontWeight: "600"
  },
  infoBox: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18
  },
  infoText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "600"
  },
  referenceCodeText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "monospace"
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 15
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 18,
    minHeight: 48,
    justifyContent: "center"
  },
  primaryBtnDisabled: {
    opacity: 0.7
  },
  primaryBtnText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "800"
  },
  logoutButton: {
    backgroundColor: "#ff5d5d",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16
  },
  logoutButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  }
});
