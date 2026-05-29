import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS } from "../constants/colors";

export default function LoginScreen({
  email,
  password,
  message,
  loading,
  keepLoggedIn,
  onChangeKeepLoggedIn,
  onChangeEmail,
  onChangePassword,
  onSubmit,
  onGoRegister,
  onForgotPassword = () => {}
}) {
  return (
    <>
      <View style={styles.cardTopLine} />
      <Text style={styles.title}>Giris Yap</Text>
      <Text style={styles.subtitle}>E-posta ve sifrenle hesabina giris yap.</Text>

      <TextInput
        value={email}
        onChangeText={onChangeEmail}
        placeholder="E-posta adresi"
        placeholderTextColor="#555555"
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={onChangePassword}
        placeholder="Sifre"
        placeholderTextColor="#555555"
        secureTextEntry
        style={styles.input}
      />

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <TouchableOpacity
        style={styles.rememberRow}
        onPress={() => onChangeKeepLoggedIn(!keepLoggedIn)}
        activeOpacity={0.8}
        disabled={loading}
      >
        <View style={[styles.checkbox, keepLoggedIn && styles.checkboxChecked]}>
          {keepLoggedIn ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
        <Text style={styles.rememberLabel}>Oturum acik kalsin</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.forgotButton} onPress={onForgotPassword}>
        <Text style={styles.forgotText}>Sifremi unuttum</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.primaryButton} onPress={onSubmit} disabled={loading}>
        <Text style={styles.primaryButtonText}>{loading ? "Giris yapiliyor..." : "Giris Yap"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={onGoRegister}>
        <Text style={styles.secondaryButtonText}>Hesap Olustur</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  cardTopLine: {
    width: 52,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginBottom: 16
  },
  title: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 6
  },
  subtitle: {
    color: COLORS.textLight,
    fontSize: 14,
    marginBottom: 22
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    color: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 13
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 10
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.black
  },
  checkboxChecked: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary
  },
  checkMark: {
    color: COLORS.black,
    fontSize: 14,
    fontWeight: "800"
  },
  rememberLabel: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600"
  },
  forgotButton: {
    alignSelf: "flex-end",
    marginBottom: 16
  },
  forgotText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.9
  },
  message: {
    color: COLORS.primary,
    marginBottom: 12,
    fontSize: 13
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10
  },
  primaryButtonText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "800"
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "700"
  }
});
