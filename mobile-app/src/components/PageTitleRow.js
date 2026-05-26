import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "../constants/colors";
import GoHomeButton from "./GoHomeButton";
import PageHeaderRightActions from "./PageHeaderRightActions";

/** Başlık satırı: sol başlık, sağ üstte isteğe bağlı buton(lar) + ana sayfaya dön. */
export default function PageTitleRow({ title, titleStyle, rightActions }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.title, titleStyle]} numberOfLines={3}>
        {title}
      </Text>
      {rightActions ? (
        <PageHeaderRightActions>{rightActions}</PageHeaderRightActions>
      ) : (
        <GoHomeButton />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 8
  },
  title: {
    flex: 1,
    flexShrink: 1,
    color: COLORS.primary,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 0
  }
});
