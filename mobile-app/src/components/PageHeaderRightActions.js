import React from "react";
import { View, StyleSheet } from "react-native";
import GoHomeButton from "./GoHomeButton";

/** Sağ üst: mevcut aksiyon(lar) + altında ana sayfaya dön. */
export default function PageHeaderRightActions({ children }) {
  return (
    <View style={styles.col}>
      {children ? <View style={styles.actions}>{children}</View> : null}
      <GoHomeButton />
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    alignItems: "flex-end",
    gap: 8,
    flexShrink: 0,
    marginLeft: 8
  },
  actions: {
    alignItems: "flex-end"
  }
});
