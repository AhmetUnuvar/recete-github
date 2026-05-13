import React from "react";
import { SafeAreaView, View, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "../constants/colors";
import { CARD_PADDING, HORIZONTAL_PADDING, SCREEN_WIDTH } from "../constants/layout";

export default function AuthLayout({ children }) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.glowCircle} />
      <View style={styles.header}>
        <Text style={styles.brand}>RECETE</Text>
      </View>
      <View style={styles.card}>{children}</View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Stok ve gelir-gider yonetimi tek ekranda.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    paddingHorizontal: HORIZONTAL_PADDING
  },
  glowCircle: {
    position: "absolute",
    top: 90,
    right: 36,
    width: Math.max(90, Math.round(SCREEN_WIDTH * 0.3)),
    height: Math.max(90, Math.round(SCREEN_WIDTH * 0.3)),
    borderRadius: 60,
    backgroundColor: COLORS.primary,
    opacity: 0.2
  },
  header: {
    alignItems: "center",
    marginBottom: 22
  },
  brand: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 2.4
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: CARD_PADDING,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  footer: {
    marginTop: 20,
    alignItems: "center"
  },
  footerText: {
    color: COLORS.primary,
    fontSize: 13,
    opacity: 0.9
  }
});
