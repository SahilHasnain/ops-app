import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as WebBrowser from "expo-web-browser";
import {
  GithubApi,
  UnauthorizedError,
  pollForToken,
  requestDeviceCode,
  type User,
} from "@/lib/github";
import { getItem, removeItem, setItem } from "@/lib/storage";

const TOKEN_KEY = "github_access_token";
const USER_KEY = "github_user";

export type AuthStatus = "idle" | "signing-in" | "waiting" | "signed-in" | "error";

type AuthContextValue = {
  token: string | null;
  user: User | null;
  status: AuthStatus;
  error: string | null;
  deviceCode: string | null;
  booting: boolean;
  api: GithubApi | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getItem(TOKEN_KEY);
        if (!stored) {
          if (!cancelled) setStatus("idle");
          return;
        }
        setToken(stored);
        const cachedUser = await getItem(USER_KEY);
        if (cachedUser) {
          try {
            setUser(JSON.parse(cachedUser) as User);
          } catch {
            // ignore malformed cache
          }
        }
        if (!cancelled) setStatus("signed-in");
        const api = new GithubApi(stored);
        const fresh = await api.getUser();
        if (cancelled) return;
        setUser(fresh);
        await setItem(USER_KEY, JSON.stringify(fresh));
      } catch (e) {
        if (cancelled) return;
        if (e instanceof UnauthorizedError) {
          await removeItem(TOKEN_KEY);
          await removeItem(USER_KEY);
          setToken(null);
          setUser(null);
          setStatus("idle");
        }
        // network/other errors: keep the cached session
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    setStatus("signing-in");
    setError(null);
    setDeviceCode(null);
    try {
      const device = await requestDeviceCode();
      setDeviceCode(device.user_code);
      setStatus("waiting");
      const browserTimer = setTimeout(() => {
        WebBrowser.openBrowserAsync(device.verification_uri).catch(() => {});
      }, 1500);
      const accessToken = await pollForToken(
        device.device_code,
        device.interval,
        device.expires_in
      );
      clearTimeout(browserTimer);
      await setItem(TOKEN_KEY, accessToken);
      const api = new GithubApi(accessToken);
      const me = await api.getUser();
      setToken(accessToken);
      setUser(me);
      await setItem(USER_KEY, JSON.stringify(me));
      setStatus("signed-in");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    }
  }, []);

  const signOut = useCallback(async () => {
    await removeItem(TOKEN_KEY);
    await removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setDeviceCode(null);
    setStatus("idle");
    setError(null);
  }, []);

  const api = useMemo(() => (token ? new GithubApi(token) : null), [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      status,
      error,
      deviceCode,
      booting,
      api,
      signIn,
      signOut,
      clearError: () => setError(null),
    }),
    [token, user, status, error, deviceCode, booting, api, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
