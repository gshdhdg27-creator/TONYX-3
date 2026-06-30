import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUser } from "@/context/UserContext";
import { useColors } from "@/hooks/useColors";

export default function SetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setTelegramId } = useUser();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = async () => {
    const id = value.trim();
    if (!id || isNaN(Number(id)) || Number(id) <= 0) {
      setError("Enter a valid numeric Telegram ID");
      return;
    }
    setError("");
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setTelegramId(id);
    setLoading(false);
    router.replace("/(tabs)");
  };

  const styles = StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0),
    },
    inner: {
      flex: 1,
      paddingHorizontal: 28,
      justifyContent: "center",
    },
    logo: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: "rgba(99,102,241,0.15)",
      borderWidth: 1,
      borderColor: "rgba(99,102,241,0.3)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 28,
    },
    heading: {
      fontSize: 28,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      marginBottom: 8,
    },
    sub: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      lineHeight: 22,
      marginBottom: 36,
    },
    label: {
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    input: {
      height: 52,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.input,
      paddingHorizontal: 16,
      fontSize: 16,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      marginBottom: 8,
    },
    inputFocused: {
      borderColor: colors.primary,
    },
    error: {
      fontSize: 13,
      color: colors.destructive,
      fontFamily: "Inter_400Regular",
      marginBottom: 12,
    },
    hint: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginBottom: 24,
    },
    btn: {
      height: 52,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    btnDisabled: {
      opacity: 0.5,
    },
    btnText: {
      fontSize: 16,
      fontWeight: "600" as const,
      color: "#fff",
      fontFamily: "Inter_600SemiBold",
    },
    divider: {
      marginTop: 40,
      paddingTop: 24,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    tipRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      marginBottom: 12,
    },
    tipText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      flex: 1,
      lineHeight: 18,
    },
  });

  const [focused, setFocused] = useState(false);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <View style={styles.root}>
        <View style={styles.inner}>
          <View style={styles.logo}>
            <Feather name="send" size={28} color={colors.primary} />
          </View>
          <Text style={styles.heading}>Connect TONYX</Text>
          <Text style={styles.sub}>
            Enter your Telegram ID to access your TONYX wallet and earnings on
            mobile.
          </Text>

          <Text style={styles.label}>Telegram ID</Text>
          <TextInput
            style={[styles.input, focused && styles.inputFocused]}
            placeholder="e.g. 123456789"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
            value={value}
            onChangeText={setValue}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={handle}
            returnKeyType="done"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.hint}>
            Find your ID via @userinfobot in Telegram
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.btn,
              (loading || !value.trim()) && styles.btnDisabled,
              pressed && { opacity: 0.85 },
            ]}
            onPress={handle}
            disabled={loading || !value.trim()}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Continue</Text>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.tipRow}>
              <Feather name="shield" size={14} color={colors.mutedForeground} />
              <Text style={styles.tipText}>
                Your ID is stored locally and never shared.
              </Text>
            </View>
            <View style={styles.tipRow}>
              <Feather name="info" size={14} color={colors.mutedForeground} />
              <Text style={styles.tipText}>
                Use the same Telegram account as your TONYX bot to sync
                balances.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
