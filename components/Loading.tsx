import { ActivityIndicator, Text, View } from "react-native";
import { theme } from "@/constants/theme";

export default function Loading({ label }: { label?: string }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.bg,
        gap: 12,
      }}
    >
      <ActivityIndicator size="large" color={theme.accent} />
      {label ? (
        <Text style={{ color: theme.muted, fontSize: 14 }}>{label}</Text>
      ) : null}
    </View>
  );
}
