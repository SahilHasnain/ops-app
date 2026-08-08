import { Redirect } from "expo-router";
import Loading from "@/components/Loading";
import RepoList from "@/components/RepoList";
import { useAuth } from "@/lib/auth";

export default function HomeTab() {
  const { booting, status, token } = useAuth();
  if (booting) return <Loading />;
  if (status !== "signed-in" || !token) return <Redirect href="/" />;
  return <RepoList />;
}
