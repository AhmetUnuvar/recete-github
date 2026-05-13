import React from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING } from "../constants/layout";

export default function StartBigProjectScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Buyuk Projeye Basla</Text>

      <Text style={styles.label}>Proje Adi</Text>
      <TextInput style={styles.input} placeholder="Proje adi gir" placeholderTextColor="#666" />

      <Text style={styles.label}>Gider Ekle</Text>
      <TextInput
        style={styles.input}
        placeholder="Orn: Personel / Malzeme gideri"
        placeholderTextColor="#666"
      />

      <Text style={styles.label}>Gelir Ekle</Text>
      <TextInput
        style={styles.input}
        placeholder="Orn: Satis / Hizmet geliri"
        placeholderTextColor="#666"
      />

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Projeyi Olustur</Text>
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
    paddingHorizontal: HORIZONTAL_PADDING
  },
  title: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 18
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
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
    marginBottom: 16
  },
  buttonText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "800"
  }
});
