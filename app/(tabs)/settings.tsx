import { Alert, Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/constants/theme";
import ErrorView from "@/components/ErrorView";
import Loading from "@/components/Loading";
import Screen from "@/components/Screen";
import ScreenHeader from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth";

export default function SettingsTab() {
  const { booting, status, token, user, signOut } = useAuth();

  if (booting) return <Loading />;
  if (status !== "signed-in" || !token || !user) {
    return <ErrorView message="Your session is no longer available." />;
  }

  return (
    <Screen edges={[]}>
      <ScreenHeader title="Settings" />
      <View className="px-4 pt-6">
        <Text className="text-[22px] font-extrabold text-copy">Your account</Text>
        <Text className="mt-1 text-[13px] text-dim">Manage the profile connected to DevPocket.</Text>

        <View className="mt-6 flex-row items-center rounded-2xl border border-line bg-panel p-4">
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} className="h-16 w-16 rounded-full" />
          ) : (
            <View className="h-16 w-16 items-center justify-center rounded-full bg-brand/15">
              <Ionicons name="person" size={28} color={theme.accent} />
            </View>
          )}
          <View className="ml-4 flex-1">
            <Text className="text-lg font-extrabold text-copy" numberOfLines={1}>
              {user.name ?? user.login}
            </Text>
            <Text className="mt-1 text-sm text-dim">@{user.login}</Text>
          </View>
        </View>

        <Pressable
          onPress={() =>
            Alert.alert("Sign out", "Sign out of GitHub on this device?", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: signOut },
            ])
          }
          className="mt-5 flex-row items-center rounded-2xl border border-danger/30 bg-danger/10 px-4 py-4 active:bg-danger/15"
        >
          <Ionicons name="log-out-outline" size={20} color={theme.red} />
          <Text className="ml-3 flex-1 text-[15px] font-bold text-danger">Log out</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.red} />
        </Pressable>
      </View>
    </Screen>
  );
}
