import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const GAMES = [
  {
    id: "spin",
    name: "Spin & Win",
    desc: "Spin the wheel and win TONYX coins or TON rewards",
    icon: "rotate-cw",
    color: "#a78bfa",
    bg: "rgba(109,40,217,0.12)",
    border: "rgba(167,139,250,0.2)",
    badge: "HOT",
  },
  {
    id: "mines",
    name: "Mines",
    desc: "Uncover cells to win big — but avoid the mines!",
    icon: "target",
    color: "#f87171",
    bg: "rgba(239,68,68,0.10)",
    border: "rgba(248,113,113,0.2)",
    badge: null,
  },
  {
    id: "arena",
    name: "TON Arena",
    desc: "Compete with other players in real-time TON battles",
    icon: "shield",
    color: "#fbbf24",
    bg: "rgba(180,83,9,0.12)",
    border: "rgba(251,191,36,0.2)",
    badge: "NEW",
  },
];

export default function GamesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const styles = StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flex: 1,
    },
    container: {
      paddingTop: topPad + 12,
      paddingHorizontal: 16,
      paddingBottom: botPad + 90,
    },
    title: {
      fontSize: 24,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 4,
    },
    sub: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginBottom: 24,
    },
    card: {
      borderRadius: colors.radius + 2,
      borderWidth: 1,
      padding: 20,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    info: {
      flex: 1,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
    },
    gameName: {
      fontSize: 17,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    badge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: "700" as const,
      letterSpacing: 0.5,
      fontFamily: "Inter_700Bold",
    },
    gameDesc: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      lineHeight: 18,
    },
    comingSoon: {
      borderRadius: colors.radius + 2,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 20,
      alignItems: "center",
      gap: 10,
      marginTop: 8,
    },
    csText: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
    },
  });

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Games</Text>
        <Text style={styles.sub}>Play to win TONYX & TON rewards</Text>

        {GAMES.map((game) => (
          <Pressable
            key={game.id}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: game.bg,
                borderColor: game.border,
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <View style={[styles.iconWrap, { backgroundColor: game.bg }]}>
              <Feather name={game.icon as any} size={24} color={game.color} />
            </View>
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.gameName}>{game.name}</Text>
                {game.badge && (
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: game.bg, borderWidth: 1, borderColor: game.border },
                    ]}
                  >
                    <Text style={[styles.badgeText, { color: game.color }]}>
                      {game.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.gameDesc}>{game.desc}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}

        <View style={styles.comingSoon}>
          <Feather name="clock" size={22} color={colors.mutedForeground} />
          <Text style={styles.csText}>
            Games are played in the Telegram mini-app.{"\n"}
            Mobile play coming soon!
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
