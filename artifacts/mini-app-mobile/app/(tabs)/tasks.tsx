import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";
import {
  useCompleteMiniTask,
  useGetMiniTasks,
} from "@workspace/api-client-react";
import type { MiniTask } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export default function TasksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { telegramId } = useUser();
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Record<number, string>>({});

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === "web" ? 34 : 0);

  const { data, isLoading, refetch } = useGetMiniTasks(telegramId ?? "", {
    query: { enabled: !!telegramId },
  });

  const complete = useCompleteMiniTask();

  const tasks: MiniTask[] = (data as any)?.tasks ?? (Array.isArray(data) ? data : []);

  const handleComplete = (task: MiniTask) => {
    if (!telegramId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    complete.mutate(
      { id: task.id, data: { telegramId } },
      {
        onSuccess: (res) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setMessages((prev) => ({
            ...prev,
            [task.id]: `+${res.coinsEarned} TONYX`,
          }));
          qc.invalidateQueries({ queryKey: [`/api/mini/tasks/${telegramId}`] });
          qc.invalidateQueries({ queryKey: [`/api/users/${telegramId}`] });
        },
        onError: () => {
          setMessages((prev) => ({ ...prev, [task.id]: "Already claimed" }));
        },
      },
    );
  };

  const styles = StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: topPad + 12,
      paddingHorizontal: 16,
      paddingBottom: 16,
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
    },
    list: {
      paddingHorizontal: 16,
      paddingBottom: botPad + 90,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 10,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: "rgba(99,102,241,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    taskTitle: {
      fontSize: 15,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      flex: 1,
    },
    reward: {
      fontSize: 13,
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
      marginTop: 4,
    },
    descText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 8,
      lineHeight: 18,
    },
    claimBtn: {
      marginTop: 12,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    claimBtnText: {
      fontSize: 13,
      fontWeight: "600" as const,
      color: "#fff",
      fontFamily: "Inter_600SemiBold",
    },
    msgText: {
      fontSize: 12,
      color: colors.success,
      fontFamily: "Inter_500Medium",
      marginTop: 8,
      textAlign: "center",
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

  const renderTask = ({ item: task }: { item: MiniTask }) => {
    const msg = messages[task.id];
    const done = (task as any).isCompleted ?? false;
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconBox}>
            <Feather name="check-circle" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            <Text style={styles.reward}>+{task.coinsReward} TONYX</Text>
          </View>
          {done && (
            <Feather name="check" size={18} color={colors.success} />
          )}
        </View>
        {task.description ? (
          <Text style={styles.descText}>{task.description}</Text>
        ) : null}
        {!done && (
          <Pressable
            style={({ pressed }) => [
              styles.claimBtn,
              pressed && { opacity: 0.8 },
              complete.isPending && { opacity: 0.5 },
            ]}
            onPress={() => handleComplete(task)}
            disabled={complete.isPending}
          >
            <Text style={styles.claimBtnText}>Claim Reward</Text>
          </Pressable>
        )}
        {msg ? (
          <Text style={[styles.msgText, msg.includes("+") ? {} : { color: colors.mutedForeground }]}>
            {msg}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
        <Text style={styles.sub}>Complete tasks to earn TONYX</Text>
      </View>
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(t) => String(t.id)}
          renderItem={renderTask}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!tasks.length}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="inbox" size={32} color={colors.mutedForeground} />
              <Text style={styles.emptyText}>No tasks available</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
