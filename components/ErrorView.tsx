import { Pressable, Text, View } from "react-native";
import { theme } from "@/constants/theme";

export default function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.bg,
        padding: 24,
        gap: 16,
      }}
    >
      <Text style={{ color: theme.red, fontSize: 15, textAlign: "center" }}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: 1,
            paddingHorizontal: 20,
            paddingVertical: 10,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: theme.text, fontWeight: "600" }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
