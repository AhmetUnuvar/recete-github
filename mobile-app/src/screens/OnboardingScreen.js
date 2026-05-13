import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Easing
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { COLORS } from "../constants/colors";
import { HORIZONTAL_PADDING, SCREEN_WIDTH } from "../constants/layout";

const SLIDES = [
  { title: "İmalat Reçetesine Hoş Geldiniz" },
  { title: "Stoklarınızı Yönetin" },
  { title: "Gelir Giderlerinizi Takip Edin" },
  { title: "Ürün reçeteleriniz oluşturun" },
  { title: "Müşteri ve iş bazlı kar analizi yapın" }
];

const VISUAL_SIZE = Math.min(220, SCREEN_WIDTH * 0.52);
const RECIPE_LINE_MAX = Math.max(120, VISUAL_SIZE * 0.78 - 36);

function WelcomeVisual() {
  const ring = useRef(new Animated.Value(0)).current;
  const core = useRef(new Animated.Value(0.85)).current;
  const loopRef = useRef(null);

  useEffect(() => {
    ring.setValue(0);
    core.setValue(0.85);
    Animated.parallel([
      Animated.timing(ring, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.spring(core, { toValue: 1, friction: 6, useNativeDriver: true })
    ]).start();

    loopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(core, {
          toValue: 1.06,
          duration: 950,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        }),
        Animated.timing(core, {
          toValue: 1,
          duration: 950,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true
        })
      ])
    );
    loopRef.current.start();
    return () => loopRef.current?.stop?.();
  }, [core, ring]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={visualStyles.wrap}>
      <Animated.View
        style={[
          visualStyles.welcomeRing,
          { opacity: ringOpacity, transform: [{ scale: ringScale }] }
        ]}
      />
      <Animated.View style={[visualStyles.welcomeCore, { transform: [{ scale: core }] }]} />
    </View>
  );
}

function StockVisual() {
  const anims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    anims.forEach((a) => a.setValue(0));
    Animated.stagger(
      100,
      anims.map((a) =>
        Animated.timing(a, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        })
      )
    ).start();
  }, [anims]);

  return (
    <View style={visualStyles.stockGrid}>
      {anims.map((a, i) => {
        const tx = a.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
        return (
          <Animated.View
            key={String(i)}
            style={[visualStyles.stockRow, { opacity: a, transform: [{ translateX: tx }] }]}
          >
            <View style={visualStyles.stockBox} />
            <View style={[visualStyles.stockBox, { flex: 1 }]} />
            <View style={visualStyles.stockBoxNarrow} />
          </Animated.View>
        );
      })}
    </View>
  );
}

function MoneyVisual() {
  const up = useRef(new Animated.Value(0)).current;
  const down = useRef(new Animated.Value(0)).current;
  const loopRef = useRef(null);

  useEffect(() => {
    const rise = Animated.timing(up, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });
    const drop = Animated.timing(down, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });
    Animated.stagger(200, [rise, drop]).start();

    loopRef.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(up, {
            toValue: 0.92,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          }),
          Animated.timing(down, {
            toValue: 0.92,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true
          })
        ]),
        Animated.parallel([
          Animated.timing(up, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(down, { toValue: 1, duration: 700, useNativeDriver: true })
        ])
      ])
    );
    loopRef.current.start();
    return () => loopRef.current?.stop?.();
  }, [down, up]);

  const upY = up.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const downY = down.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });

  return (
    <View style={visualStyles.moneyRow}>
      <Animated.View style={[visualStyles.moneyCol, { transform: [{ translateY: upY }] }]}>
        <View style={visualStyles.triUp} />
        <Text style={visualStyles.moneyLabelIncome}>Gelir</Text>
      </Animated.View>
      <View style={visualStyles.moneyDivider} />
      <Animated.View style={[visualStyles.moneyCol, { transform: [{ translateY: downY }] }]}>
        <View style={visualStyles.triDown} />
        <Text style={visualStyles.moneyLabelExpense}>Gider</Text>
      </Animated.View>
    </View>
  );
}

function RecipeVisual() {
  const doc = useRef(new Animated.Value(0)).current;
  const lines = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    doc.setValue(0);
    lines.forEach((l) => l.setValue(0));
    Animated.sequence([
      Animated.spring(doc, { toValue: 1, friction: 8, useNativeDriver: true }),
      Animated.stagger(
        90,
        lines.map((l) =>
          Animated.timing(l, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false
          })
        )
      )
    ]).start();
  }, [doc, lines]);

  const docScale = doc.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });

  return (
    <Animated.View
      style={[visualStyles.recipePaper, { opacity: doc, transform: [{ scale: docScale }] }]}
    >
      {lines.map((l, i) => (
        <View key={String(i)} style={visualStyles.recipeLineTrack}>
          <Animated.View
            style={[
              visualStyles.recipeLineInner,
              {
                width: l.interpolate({ inputRange: [0, 1], outputRange: [8, RECIPE_LINE_MAX] })
              }
            ]}
          />
        </View>
      ))}
    </Animated.View>
  );
}

function AnalyticsVisual() {
  const targets = [48, 76, 58];
  const anims = useRef(targets.map(() => new Animated.Value(4))).current;

  useEffect(() => {
    anims.forEach((a) => a.setValue(4));
    Animated.stagger(
      120,
      anims.map((a, i) =>
        Animated.timing(a, {
          toValue: targets[i],
          duration: 720,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false
        })
      )
    ).start();
  }, [anims]);

  return (
    <View style={visualStyles.chartRow}>
      {anims.map((a, i) => (
        <View key={String(i)} style={visualStyles.chartBarTrack}>
          <Animated.View style={[visualStyles.chartBar, { height: a }]} />
        </View>
      ))}
    </View>
  );
}

function SlideVisual({ step }) {
  const visuals = [
    <WelcomeVisual key="w" />,
    <StockVisual key="s" />,
    <MoneyVisual key="m" />,
    <RecipeVisual key="r" />,
    <AnalyticsVisual key="a" />
  ];
  return (
    <View style={[visualStyles.stage, { width: VISUAL_SIZE, height: VISUAL_SIZE }]}>
      {visuals[step]}
    </View>
  );
}

const visualStyles = StyleSheet.create({
  stage: {
    alignSelf: "center",
    marginBottom: 28,
    justifyContent: "center",
    alignItems: "center"
  },
  wrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center"
  },
  welcomeRing: {
    position: "absolute",
    width: VISUAL_SIZE * 0.92,
    height: VISUAL_SIZE * 0.92,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: COLORS.primary
  },
  welcomeCore: {
    width: VISUAL_SIZE * 0.38,
    height: VISUAL_SIZE * 0.38,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    opacity: 0.95
  },
  stockGrid: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    paddingHorizontal: 4
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12
  },
  stockBox: {
    height: 22,
    width: 56,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    opacity: 0.85,
    marginRight: 10
  },
  stockBoxNarrow: {
    height: 22,
    width: 28,
    borderRadius: 6,
    backgroundColor: COLORS.border
  },
  moneyRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center"
  },
  moneyCol: {
    alignItems: "center",
    width: 88
  },
  triUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 18,
    borderRightWidth: 18,
    borderBottomWidth: 28,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#62d26f"
  },
  triDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 18,
    borderRightWidth: 18,
    borderTopWidth: 28,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#ff6d6d"
  },
  moneyDivider: {
    width: 1,
    height: 72,
    backgroundColor: COLORS.border,
    marginHorizontal: 16
  },
  moneyLabelIncome: {
    color: "#62d26f",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10
  },
  moneyLabelExpense: {
    color: "#ff6d6d",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10
  },
  recipePaper: {
    width: VISUAL_SIZE * 0.78,
    minHeight: VISUAL_SIZE * 0.62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingVertical: 22,
    paddingHorizontal: 16,
    justifyContent: "center"
  },
  recipeLineTrack: {
    height: 14,
    marginBottom: 12,
    justifyContent: "center"
  },
  recipeLineInner: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    opacity: 0.8
  },
  chartRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingBottom: 8
  },
  chartBarTrack: {
    width: 36,
    height: 96,
    justifyContent: "flex-end",
    alignItems: "center",
    marginHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.border
  },
  chartBar: {
    width: 32,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: COLORS.primary
  }
});

export default function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(0);
  const lastIndex = SLIDES.length - 1;
  const isLast = step >= lastIndex;

  const titleOpacity = useRef(new Animated.Value(1)).current;
  const titleY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    titleOpacity.setValue(0);
    titleY.setValue(10);
    Animated.parallel([
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(titleY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]).start();
  }, [step, titleOpacity, titleY]);

  const handleNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setStep((s) => Math.min(s + 1, lastIndex));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={styles.body}>
        <View style={styles.slideWrap}>
          <SlideVisual step={step} />
          <Animated.Text
            style={[
              styles.title,
              { opacity: titleOpacity, transform: [{ translateY: titleY }] }
            ]}
          >
            {SLIDES[step].title}
          </Animated.Text>
        </View>

        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View key={String(i)} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        <View style={styles.footerRow}>
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.nextBtnText}>İleri</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  body: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_PADDING
  },
  slideWrap: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: 12
  },
  title: {
    color: COLORS.primary,
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 34,
    textAlign: "center"
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    marginHorizontal: 4
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    width: 10,
    height: 10,
    borderRadius: 5
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingBottom: 12
  },
  nextBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 120,
    alignItems: "center"
  },
  nextBtnText: {
    color: COLORS.black,
    fontSize: 16,
    fontWeight: "800"
  }
});
