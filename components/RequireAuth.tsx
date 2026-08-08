import { ReactNode } from "react";
import Loading from "@/components/Loading";
import SignIn from "@/components/SignIn";
import { useAuth } from "@/lib/auth";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { status, booting } = useAuth();
  if (booting) return <Loading />;
  if (status !== "signed-in") return <SignIn />;
  return <>{children}</>;
}
