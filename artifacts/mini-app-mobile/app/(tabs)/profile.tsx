import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import {
  useGetMiniHistory,
  useGetReferrals,
  useGetUserProfile,
} from "@workspace/api-client-react";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { telegramId, clearTelegramId } = useUser();

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const {
    data: profile,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = useGetUserProfile(telegramId ?? "", {
    query: { enabled: !!telegramId },
  });

  const { data: history, refetch: refetchHistory } = useGetMiniHistory(
    telegramId ?? "",
    { query: { enabled: !!telegramId } },
  );

  const { data: referrals } = useGetReferrals(telegramId ?? "", {
    query: { enabled: !!telegramId },
  });

  const historyItems: any[] = Array.isArray(history)
    ? history
    : (history as any)?.items ?? [];

  const onRefresh = async () => {
    await Promise.all([refetchProfile(), refetchHistory()]);
  };

  const handleLogout = () => {
    Alert.alert(
      "Disconnect account",
      "This will remove your Telegram ID from this device. Your TONYX balance is safe.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            await clearTelegramId();
            router.replace("/setup");
          },
        },
      ],
    );
  };

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
    profileRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginBottom: 20,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: "rgba(99,102,241,0.15)",
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontSize: 22,
      fontWeight: "700" as const,
      color: colors.primary,
      fontFamily: "Inter_700Bold",
    },
    profileInfo: {
      flex: 1,
    },
    displayName: {
      fontSize: 18,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    },
    idText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    section: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 10,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    statRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    statLabel: {
      flex: 1,
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    statValue: {
      fontSize: 14,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    depositBox: {
      backgroundColor: "rgba(99,102,241,0.08)",
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.2)",
      borderRadius: colors.radius,
      padding: 16,
      marginBottom: 16,
    },
    depositLabel: {
      fontSize: 12,
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    depositCode: {
      fontSize: 18,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      letterSpacing: 1.5,
      marginBottom: 6,
    },
    depositHint: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    historyItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    histIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    histLabel: {
      flex: 1,
      fontSize: 13,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    histAmount: {
      fontSize: 13,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 46,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: "rgba(239,68,68,0.2)",
      backgroundColor: "rgba(239,68,68,0.06)",
      marginTop: 8,
    },
    logoutText: {
      fontSize: 14,
      fontWeight: "600" as const,
      color: colors.destructive,
      fontFamily: "Inter_600SemiBold",
    },
    empty: {
      paddingVertical: 20,
      alignItems: "center",
    },
    emptyText: {
      color: colors.mutedForeground,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
    },
  });

  const initial = (
    profile?.username ??
    profile?.firstName ??
    telegramId ??
    "?"
  )[0].toUpperCase();

  return (
    <ScrollView
      style={[styles.root, styles.scroll]}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={profileLoading}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          {profileLoading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={styles.avatarText}>{initial}</Text>
          )}
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>
            {profile?.username
              ? `@${profile.username}`
              : profile?.firstName ?? "TONYX User"}
          </Text>
          <Text style={styles.idText}>ID: {telegramId}</Text>
        </View>
      </View>

      {profile?.depositCode ? (
        <View style={styles.depositBox}>
          <Text style={styles.depositLabel}>Deposit Code</Text>
          <Text style={styles.depositCode}>{profile.depositCode}</Text>
          <Text style={styles.depositHint}>
            Use this code to deposit TONYX via the Telegram bot
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Balances</Text>
        <View style={styles.card}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>TONYX Balance</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {(profile?.tonyxCoins ?? 0).toLocaleString()}
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>TON Balance</Text>
            <Text style={[styles.statValue, { color: colors.accent }]}>
              {(profile?.tonBalance ?? 0).toFixed(4)} TON
            </Text>
          </View>
          <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.statLabel}>Boost Rate</Text>
            <Text style={[styles.statValue, { color: colors.warning }]}>
              {profile?.boostRate ?? 1}x
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Referrals</Text>
        <View style={styles.card}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Referrals</Text>
            <Text style={styles.statValue}>
              {(referrals as any)?.totalReferrals ?? profile?.referralCount ?? 0}
            </Text>
          </View>
          <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.statLabel}>Earned from Refs</Text>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {(referrals as any)?.totalEarned ?? 0} TONYX
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent History</Text>
        <View style={styles.card}>
          {historyItems.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No history yet</Text>
            </View>
          ) : (
            historyItems.slice(0, 8).map((item: any, i: number) => {
              const isPositive = (item.amount ?? 0) > 0;
              return (
                <View
                  key={String(item.id ?? i)}
                  style={[
                    styles.historyItem,
                    i === Math.min(historyItems.length, 8) - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View
                    style={[
                      styles.histIcon,
                      {
                        backgroundColor: isPositive
                          ? "rgba(34,197,94,0.1)"
                          : "rgba(239,68,68,0.1)",
                      },
                    ]}
                  >
                    <Feather
                      name={isPositive ? "arrow-down-left" : "arrow-up-right"}
                      size={14}
                      color={isPositive ? colors.success : colors.destructive}
                    />
                  </View>
                  <Text style={styles.histLabel} numberOfLines={1}>
                    {item.type ?? item.description ?? "Transaction"}
                  </Text>
                  <Text
                    style={[
                      styles.histAmount,
                      { color: isPositive ? colors.success : colors.destructive },
                    ]}
                  >
                    {isPositive ? "+" : ""}
                    {item.amount ?? 0}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
        onPress={handleLogout}
      >
        <Feather name="log-out" size={16} color={colors.destructive} />
        <Text style={styles.logoutText}>Disconnect Account</Text>
      </Pressable>
    </ScrollView>
  );
}
