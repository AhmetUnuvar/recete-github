import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";

export default function PlaceholderScreen({ title }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: HORIZONTAL_PADDING
  },
  title: {
    color: COLORS.primary,
    fontSize: 34,
    fontWeight: "800",
    textAlign: "center"
  }
});
