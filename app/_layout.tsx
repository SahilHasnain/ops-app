import "../global.css";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { theme } from "@/constants/theme";
import { AuthProvider } from "@/lib/auth";
import { DraftProvider } from "@/lib/drafts";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DraftProvider>
          <StatusBar style="light" backgroundColor={theme.surface} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.bg },
            }}
          />
        </DraftProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
