import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/constants/theme";

export default function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <SafeAreaView edges={["top"]} className="bg-panel">
      <View className="min-h-[58px] flex-row items-center border-b border-line bg-panel px-3 py-2">
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            className="mr-1 rounded-lg bg-raised p-2"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={theme.text} />
          </Pressable>
        ) : null}
        <Text
          className="flex-1 text-base font-extrabold text-copy"
          numberOfLines={1}
        >
          {title}
        </Text>
        {right}
      </View>
    </SafeAreaView>
  );
}
