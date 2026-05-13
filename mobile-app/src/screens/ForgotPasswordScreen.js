import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from "react-native";
import { COLORS } from "../constants/colors";

export default function ForgotPasswordScreen({
  email,
  onChangeEmail,
  verificationCode,
  onChangeVerificationCode,
  newPassword,
  onChangeNewPassword,
  confirmPassword,
  onChangeConfirmPassword,
  onSendCode,
  sendCodeLoading,
  codeHint,
  message,
  loading,
  onSubmit,
  onGoLogin
}) {
  return (
    <>
      <Text style={styles.title}>Sifremi unuttum</Text>
      <Text style={styles.subtitle}>
        E-postana gelen 6 haneli kodu gir, ardindan yeni sifreni belirle.
      </Text>

      <TextInput
        value={email}
        onChangeText={onChangeEmail}
        placeholder="E-posta adresi"
        placeholderTextColor="#555555"
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
      />

      <View style={styles.sendCodeRow}>
        <TouchableOpacity
          style={[styles.sendCodeBtn, sendCodeLoading && styles.sendCodeBtnDisabled]}
          onPress={onSendCode}
          disabled={sendCodeLoading}
        >
          {sendCodeLoading ? (
            <ActivityIndicator color={COLORS.black} size="small" />
          ) : (
            <Text style={styles.sendCodeBtnText}>Dogrulama kodu gonder</Text>
          )}
        </TouchableOpacity>
      </View>

      <TextInput
        value={verificationCode}
        onChangeText={(v) => onChangeVerificationCode(v.replace(/\D/g, "").slice(0, 6))}
        placeholder="E-postadaki 6 haneli kod"
        placeholderTextColor="#555555"
        keyboardType="number-pad"
        maxLength={6}
        style={styles.input}
      />

      {codeHint ? <Text style={styles.hint}>{codeHint}</Text> : null}

      <TextInput
        value={newPassword}
        onChangeText={onChangeNewPassword}
        placeholder="Yeni sifre (en az 6 karakter)"
        placeholderTextColor="#555555"
        secureTextEntry
        style={styles.input}
      />
      <TextInput
        value={confirmPassword}
        onChangeText={onChangeConfirmPassword}
        placeholder="Yeni sifre tekrar"
        placeholderTextColor="#555555"
        secureTextEntry
        style={styles.input}
      />

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <TouchableOpacity style={styles.primaryButton} onPress={onSubmit} disabled={loading}>
        <Text style={styles.primaryButtonText}>{loading ? "Kaydediliyor..." : "Yeni sifreyi kaydet"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={onGoLogin}>
        <Text style={styles.secondaryButtonText}>Giris ekranina don</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    color: COLORS.primary,
    fontSize: 28,
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
  sendCodeRow: {
    marginBottom: 13
  },
  sendCodeBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46
  },
  sendCodeBtnDisabled: {
    opacity: 0.65
  },
  sendCodeBtnText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "700"
  },
  hint: {
    color: COLORS.textLight,
    fontSize: 13,
    marginTop: -6,
    marginBottom: 10
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
