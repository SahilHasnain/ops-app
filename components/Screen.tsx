import { ReactNode } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

export default function Screen({
  children,
  style,
  edges = ["bottom"],
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
}) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-ink" style={style}>
      {children}
    </SafeAreaView>
  );
}
