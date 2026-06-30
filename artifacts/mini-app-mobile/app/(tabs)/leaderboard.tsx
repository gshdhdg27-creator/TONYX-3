import { Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import { GetMiniLeaderboardCategory, useGetMiniLeaderboard } from "@workspace/api-client-react";
import { useState } from "react";

type Cat = "top_earn" | "top_players" | "referrals";

const TABS: { key: Cat; label: string; icon: string }[] = [
  { key: "top_earn", label: "Earners", icon: "trending-up" },
  { key: "top_players", label: "Players", icon: "play" },
  { key: "referrals", label: "Referrals", icon: "users" },
];

const MEDALS: Record<number, { color: string; icon: string }> = {
  1: { color: "#fbbf24", icon: "award" },
  2: { color: "#94a3b8", icon: "award" },
  3: { color: "#f97316", icon: "award" },
};

export default function LeaderboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { telegramId } = useUser();
  const [cat, setCat] = useState<Cat>("top_earn");

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data, isLoading } = useGetMiniLeaderboard(
    { category: cat as any, telegramId: telegramId ?? undefined },
    { query: { refetchInterval: 15000 } },
  );

  const entries = (data as any)?.entries ?? [];

  const valueLabel = (n: number, ton?: number) => {
    if (cat === "referrals") return `${n} refs`;
    if (cat === "top_players") return `${n} ads`;
    return `${n.toLocaleString()} TONYX`;
  };

  const styles = StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: topPad + 12,
      paddingHorizontal: 16,
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
      marginBottom: 16,
    },
    tabRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 16,
    },
    tab: {
      flex: 1,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 5,
    },
    tabText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      fontWeight: "600" as const,
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: botPad + 90,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
      gap: 12,
    },
    myRow: {
      borderColor: colors.primary,
      backgroundColor: "rgba(99,102,241,0.08)",
    },
    rankBox: {
      width: 32,
      alignItems: "center",
    },
    rankText: {
      fontSize: 14,
      fontWeight: "700" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_700Bold",
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(99,102,241,0.15)",
    },
    avatarText: {
      fontSize: 14,
      fontWeight: "600" as const,
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
    },
    name: {
      flex: 1,
      fontSize: 14,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
      fontWeight: "500" as const,
    },
    value: {
      fontSize: 13,
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
      fontWeight: "600" as const,
    },
    empty: {
      alignItems: "center",
      paddingTop: 60,
      gap: 12,
    },
    emptyText: {
      color: colors.mutedForeground,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
    },
  });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
        <Text style={styles.sub}>Top TONYX community members</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {TABS.map((t) => {
            const active = cat === t.key;
            return (
              <Pressable
                key={t.key}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active
                      ? "rgba(99,102,241,0.18)"
                      : colors.secondary,
                  },
                ]}
                onPress={() => setCat(t.key)}
              >
                <Feather
                  name={t.icon as any}
                  size={13}
                  color={active ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item: any) => String(item.telegramId ?? item.rank)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!entries.length}
          renderItem={({ item, index }: { item: any; index: number }) => {
            const rank = index + 1;
            const isMe = item.telegramId === telegramId;
            const medal = MEDALS[rank];
            const initial = (item.username ?? item.firstName ?? "?")[0].toUpperCase();
            return (
              <View style={[styles.row, isMe && styles.myRow]}>
                <View style={styles.rankBox}>
                  {medal ? (
                    <Feather name="award" size={18} color={medal.color} />
                  ) : (
                    <Text style={styles.rankText}>{rank}</Text>
                  )}
                </View>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {item.username ? `@${item.username}` : item.firstName ?? `ID ${item.telegramId}`}
                  {isMe ? " (you)" : ""}
                </Text>
                <Text style={styles.value}>
                  {valueLabel(item.value ?? item.score ?? 0, item.tonAmount)}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="bar-chart-2" size={32} color={colors.mutedForeground} />
              <Text style={styles.emptyText}>No data yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
