import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/constants/theme";
import { useAuth } from "@/lib/auth";
import Screen from "@/components/Screen";

export default function SignIn() {
  const { status, error, deviceCode, signIn, clearError } = useAuth();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!deviceCode) return;
    Clipboard.setStringAsync(deviceCode).catch(() => {});
    setCopied(true);
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [deviceCode]);

  const openDevicePage = () => {
    WebBrowser.openBrowserAsync("https://github.com/login/device").catch(() => {});
  };

  const copyCode = () => {
    if (!deviceCode) return;
    Clipboard.setStringAsync(deviceCode).catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Screen
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <Ionicons name="logo-github" size={64} color={theme.text} />
      <Text style={{ color: theme.text, fontSize: 28, fontWeight: "700", marginTop: 16 }}>
        DevPocket
      </Text>
      <Text
        style={{ color: theme.muted, fontSize: 15, textAlign: "center", marginTop: 8, lineHeight: 22 }}
      >
        Make quick GitHub edits and trigger Actions from your phone.
      </Text>
      <View style={{ marginTop: 40, width: "100%", gap: 12 }}>
        {status === "idle" ? (
          <>
            <Pressable
              onPress={signIn}
              style={{
                backgroundColor: theme.accent,
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: theme.white, fontSize: 16, fontWeight: "600" }}>
                Sign in with GitHub
              </Text>
            </Pressable>
            <Text style={{ color: theme.muted, fontSize: 12, textAlign: "center" }}>
              Uses GitHub device flow — no password is stored on your device.
            </Text>
          </>
        ) : null}

        {status === "signing-in" ? (
          <View style={{ alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={theme.accent} />
            <Text style={{ color: theme.muted, fontSize: 14 }}>Starting sign-in…</Text>
          </View>
        ) : null}

        {status === "waiting" ? (
          <View style={{ gap: 14 }}>
            <Text style={{ color: theme.muted, fontSize: 14, textAlign: "center" }}>
              The code was copied to your clipboard. Enter it on the GitHub page:
            </Text>
            <Pressable
              onPress={copyCode}
              style={{
                backgroundColor: theme.surface,
                borderColor: copied ? theme.green : theme.border,
                borderWidth: 1,
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: "center",
                gap: 6,
              }}
            >
              <Text style={{ color: theme.text, fontSize: 32, fontWeight: "700", letterSpacing: 4 }}>
                {deviceCode ?? "—"}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={14} color={copied ? theme.green : theme.muted} />
                <Text style={{ color: copied ? theme.green : theme.muted, fontSize: 12, fontWeight: "600" }}>
                  {copied ? "Code copied!" : "Tap to copy"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={openDevicePage}
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderWidth: 1,
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "600" }}>
                Open github.com/login/device
              </Text>
            </Pressable>
            <Text style={{ color: theme.muted, fontSize: 13, textAlign: "center" }}>
              Waiting for you to authorize this app…
            </Text>
          </View>
        ) : null}

        {status === "error" ? (
          <>
            <View
              style={{
                backgroundColor: "rgba(248,81,73,0.1)",
                borderColor: theme.red,
                borderWidth: 1,
                borderRadius: 10,
                padding: 14,
              }}
            >
              <Text style={{ color: theme.red, fontSize: 14, textAlign: "center" }}>{error}</Text>
            </View>
            <Pressable
              onPress={() => {
                clearError();
                signIn();
              }}
              style={{
                backgroundColor: theme.accent,
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: theme.white, fontSize: 16, fontWeight: "600" }}>Try again</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
