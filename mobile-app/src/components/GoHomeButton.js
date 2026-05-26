import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { COLORS } from "../constants/colors";
import { useAppNav } from "../context/AppNavContext";

export default function GoHomeButton({ onPress }) {
  const { goHome } = useAppNav();
  const handlePress = onPress || goHome;

  return (
    <TouchableOpacity style={styles.btn} onPress={handlePress} activeOpacity={0.85} accessibilityRole="button">
      <Text style={styles.btnText} numberOfLines={2}>
        Ana sayfaya dön
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 118,
    alignItems: "center",
    justifyContent: "center"
  },
  btnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 14
  }
});
