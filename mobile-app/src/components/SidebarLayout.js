import React, { useEffect, useRef, useState, useMemo } from "react";
import { SafeAreaView, View, Text, TouchableOpacity, Pressable, StyleSheet, Animated } from "react-native";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING, SIDEBAR_WIDTH } from "../constants/layout";
import { AppNavContext } from "../context/AppNavContext";

export default function SidebarLayout({ activeKey, onSelect, children }) {
  const navValue = useMemo(
    () => ({
      goHome: () => {
        if (activeKey !== "home") {
          onSelect("home");
        }
      }
    }),
    [activeKey, onSelect]
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const menuItems = [
    { key: "home", label: "Ana Sayfa" },
    { key: "customers", label: "Müşteriler" },
    { key: "fixed-income-expense", label: "Sabit Gelir Gider Ekle" },
    { key: "profit-summary", label: "Sabit Gelir Giderlerim" },
    { key: "stock-ops", label: "Stok Ekle" },
    { key: "my-stocks", label: "Stoklarım" },
    { key: "add-product", label: "Ürün Ekle" },
    { key: "my-products", label: "Ürün Reçetelerim" },
    { key: "my-owned-products", label: "Ürünlerim" },
    { key: "retail-buy", label: "Perakende Ürün Al" },
    { key: "my-retail-products", label: "Perakende Ürünlerim" },
    { key: "debts-receivables", label: "Borçlar Alacaklar" },
    { key: "earnings-summary", label: "Kazanç Özeti" },
    { key: "profile", label: "Profil" },
    { key: "logout", label: "Çıkış Yap" }
  ];

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true
        })
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -SIDEBAR_WIDTH,
        duration: 200,
        useNativeDriver: true
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true
      })
    ]).start(({ finished }) => {
      if (finished) {
        setIsVisible(false);
      }
    });
  }, [isOpen, backdropAnim, slideAnim]);

  return (
    <AppNavContext.Provider value={navValue}>
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity style={styles.hamburgerButton} onPress={() => setIsOpen(true)}>
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
          <View style={styles.hamburgerLine} />
        </TouchableOpacity>
        <View style={styles.pageContent}>{children}</View>
      </View>

      {isVisible && (
        <View style={styles.overlay}>
          <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
            <Text style={styles.logo}>İmalat Reçetesi</Text>
            {menuItems.map((item) => (
              <TouchableOpacity
                key={item.key}
                onPress={() => {
                  setIsOpen(false);
                  onSelect(item.key);
                }}
                style={[
                  styles.menuItem,
                  activeKey === item.key && item.key !== "logout" && styles.menuItemActive
                ]}
              >
                <Text
                  style={[
                    styles.menuText,
                    activeKey === item.key && item.key !== "logout" && styles.menuTextActive,
                    item.key === "logout" && styles.logoutText
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
            <Pressable style={styles.backdropPressable} onPress={() => setIsOpen(false)} />
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
    </AppNavContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row"
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)"
  },
  backdropPressable: {
    flex: 1
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    height: "100%",
    backgroundColor: COLORS.card,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingHorizontal: 14,
    paddingTop: 52,
    zIndex: 2
  },
  logo: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginBottom: 14
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 7
  },
  menuItemActive: {
    backgroundColor: COLORS.primary
  },
  menuText: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "600"
  },
  menuTextActive: {
    color: COLORS.black
  },
  logoutText: {
    color: "#ff5d5d"
  },
  content: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 14,
    paddingBottom: 14
  },
  pageContent: {
    flex: 1
  },
  hamburgerButton: {
    width: 44,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12
  },
  hamburgerLine: {
    width: 18,
    height: 2,
    backgroundColor: COLORS.primary,
    marginVertical: 1.5
  }
});
