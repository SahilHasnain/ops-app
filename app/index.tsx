import Loading from "@/components/Loading";
import SignIn from "@/components/SignIn";
import { useAuth } from "@/lib/auth";
import { Redirect } from "expo-router";

export default function Home() {
  const { status, token, booting } = useAuth();

  if (booting) return <Loading />;
  if (status === "signed-in" && token) return <Redirect href={"/(tabs)" as never} />;
  return <SignIn />;
}
