import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import {
  ActivityIndicator,
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
  useGetMiniEarnStatus,
  useGetUserProfile,
  useRecordMiniAdWatch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function StatCard({
  label,
  value,
  icon,
  accent,
  colors,
}: {
  label: string;
  value: string;
  icon: string;
  accent?: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: colors.radius,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
        gap: 6,
      }}
    >
      <Feather
        name={icon as any}
        size={16}
        color={accent ?? colors.mutedForeground}
      />
      <Text
        style={{
          fontSize: 18,
          fontWeight: "700" as const,
          color: accent ?? colors.foreground,
          fontFamily: "Inter_700Bold",
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: colors.mutedForeground,
          fontFamily: "Inter_400Regular",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { telegramId, isReady } = useUser();
  const qc = useQueryClient();

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } =
    useGetUserProfile(telegramId ?? "", {
      query: { enabled: !!telegramId, refetchInterval: 30000 },
    });

  const { data: earnStatus, refetch: refetchEarn } = useGetMiniEarnStatus(
    telegramId ?? "",
    { query: { enabled: !!telegramId, refetchInterval: 30000 } },
  );

  const watchAd = useRecordMiniAdWatch();
  const [earnMsg, setEarnMsg] = useState<string | null>(null);

  const handleEarn = async () => {
    if (!telegramId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEarnMsg(null);
    watchAd.mutate(
      { data: { telegramId } },
      {
        onSuccess: (res) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setEarnMsg(`+${res.coinsEarned} TONYX earned!`);
          qc.invalidateQueries({ queryKey: [`/api/users/${telegramId}`] });
          qc.invalidateQueries({ queryKey: [`/api/mini/earn/status/${telegramId}`] });
        },
        onError: () => {
          setEarnMsg("Try again later");
        },
      },
    );
  };

  if (!isReady) {
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!telegramId) {
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 32 }}
      >
        <Feather name="user-x" size={40} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, fontSize: 15, marginTop: 12, textAlign: "center", fontFamily: "Inter_400Regular" }}>
          Account not connected
        </Text>
        <Pressable
          onPress={() => router.replace("/setup")}
          style={{ marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: colors.radius }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" }}>Set up account</Text>
        </Pressable>
      </View>
    );
  }

  const balance = profile?.tonyxCoins ?? 0;
  const tonBalance = profile?.tonBalance ?? 0;
  const adsToday = earnStatus?.adsWatchedToday ?? 0;
  const adsLimit = earnStatus?.dailyAdLimit ?? 10;
  const cooldown = earnStatus?.cooldownSeconds ?? 0;
  const canEarn = cooldown === 0 && adsToday < adsLimit;

  const onRefresh = async () => {
    await Promise.all([refetchProfile(), refetchEarn()]);
  };

  const styles = StyleSheet.create({
    scroll: { backgroundColor: colors.background },
    container: {
      paddingTop: topPad + 12,
      paddingHorizontal: 16,
      paddingBottom: botPad + 90,
    },
    greeting: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginBottom: 4,
    },
    username: {
      fontSize: 22,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 20,
    },
    balanceCard: {
      borderRadius: colors.radius + 2,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: 16,
    },
    balanceLabel: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    balanceAmount: {
      fontSize: 42,
      fontWeight: "700" as const,
      color: colors.primary,
      fontFamily: "Inter_700Bold",
      marginBottom: 4,
    },
    balanceSub: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    statsRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 16,
    },
    earnCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 2,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: 16,
    },
    earnTitle: {
      fontSize: 16,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      marginBottom: 4,
    },
    earnSub: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginBottom: 16,
    },
    earnBtn: {
      height: 48,
      borderRadius: colors.radius,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    earnBtnText: {
      fontSize: 15,
      fontWeight: "600" as const,
      color: "#fff",
      fontFamily: "Inter_600SemiBold",
    },
    progressBar: {
      height: 4,
      backgroundColor: colors.secondary,
      borderRadius: 2,
      overflow: "hidden",
      marginBottom: 8,
    },
    progressFill: {
      height: 4,
      backgroundColor: colors.primary,
      borderRadius: 2,
    },
    progressText: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    msgText: {
      textAlign: "center",
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      marginTop: 10,
    },
  });

  return (
    <ScrollView
      style={styles.scroll}
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
      <Text style={styles.greeting}>Welcome back</Text>
      <Text style={styles.username}>
        {profile?.username ? `@${profile.username}` : `ID ${telegramId}`}
      </Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>TONYX Balance</Text>
        {profileLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
        ) : (
          <>
            <Text style={styles.balanceAmount}>
              {balance.toLocaleString()}
            </Text>
            <Text style={styles.balanceSub}>
              ≈ {tonBalance.toFixed(4)} TON
            </Text>
          </>
        )}
      </View>

      <View style={styles.statsRow}>
        <StatCard
          label="Ads today"
          value={`${adsToday}/${adsLimit}`}
          icon="play-circle"
          accent={colors.accent}
          colors={colors}
        />
        <StatCard
          label="Boost rate"
          value={`${profile?.boostRate ?? 1}x`}
          icon="zap"
          accent={colors.warning}
          colors={colors}
        />
        <StatCard
          label="Referrals"
          value={String(profile?.referralCount ?? 0)}
          icon="users"
          colors={colors}
        />
      </View>

      <View style={styles.earnCard}>
        <Text style={styles.earnTitle}>Watch & Earn</Text>
        <Text style={styles.earnSub}>
          Watch an ad to earn TONYX coins instantly
        </Text>

        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, (adsToday / adsLimit) * 100)}%` as any,
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {adsToday}/{adsLimit} ads watched today
        </Text>

        <View style={{ height: 14 }} />

        <Pressable
          style={({ pressed }) => [
            styles.earnBtn,
            {
              backgroundColor: canEarn ? colors.primary : colors.secondary,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={handleEarn}
          disabled={!canEarn || watchAd.isPending}
        >
          {watchAd.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather
                name={canEarn ? "play" : "clock"}
                size={16}
                color={canEarn ? "#fff" : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.earnBtnText,
                  { color: canEarn ? "#fff" : colors.mutedForeground },
                ]}
              >
                {cooldown > 0
                  ? `Cooldown ${cooldown}s`
                  : adsToday >= adsLimit
                  ? "Daily limit reached"
                  : "Watch Ad"}
              </Text>
            </>
          )}
        </Pressable>
        {earnMsg && (
          <Text
            style={[
              styles.msgText,
              {
                color: earnMsg.includes("+")
                  ? colors.success
                  : colors.destructive,
              },
            ]}
          >
            {earnMsg}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
