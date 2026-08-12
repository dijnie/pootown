"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthSessionResponse, AuthUser } from "@pootown/game-contracts";

import { AuthDialog } from "@/components/auth-dialog";
import envConfig from "@/configs/env";
import { createAuthApi } from "@/services/auth-api";

type Credentials = { readonly email: string; readonly password: string };

type AuthContextValue = {
  readonly authenticated: boolean;
  readonly getAccessToken: () => Promise<string | null>;
  readonly login: (credentials: Credentials) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly openLogin: () => void;
  readonly openRegister: () => void;
  readonly ready: boolean;
  readonly refreshAccessToken: () => Promise<string | null>;
  readonly register: (credentials: Credentials) => Promise<void>;
  readonly user: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const authApi = useMemo(() => createAuthApi(envConfig.NEXT_PUBLIC_API_URL), []);
  const accessToken = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);
  const generation = useRef(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [dialogMode, setDialogMode] = useState<"login" | "register" | null>(null);

  const applySession = useCallback((session: AuthSessionResponse): string => {
    accessToken.current = session.accessToken;
    setUser(session.user);
    return session.accessToken;
  }, []);

  const clearSession = useCallback(() => {
    accessToken.current = null;
    setUser(null);
  }, []);

  const refreshAccessToken = useCallback((): Promise<string | null> => {
    if (refreshInFlight.current !== null) return refreshInFlight.current;
    const current = generation.current;
    const pending = authApi.refresh()
      .then((session) => current === generation.current ? applySession(session) : null)
      .catch(() => {
        if (current === generation.current) clearSession();
        return null;
      })
      .finally(() => {
        if (refreshInFlight.current === pending) refreshInFlight.current = null;
      });
    refreshInFlight.current = pending;
    return pending;
  }, [applySession, authApi, clearSession]);

  useEffect(() => {
    let active = true;
    void refreshAccessToken().finally(() => active && setReady(true));
    return () => {
      active = false;
      generation.current += 1;
    };
  }, [refreshAccessToken]);

  const login = useCallback(async (credentials: Credentials) => {
    const current = ++generation.current;
    const session = await authApi.login({ ...credentials, email: credentials.email.trim().toLowerCase() });
    if (current !== generation.current) return;
    applySession(session);
    setDialogMode(null);
  }, [applySession, authApi]);

  const register = useCallback(async (credentials: Credentials) => {
    const current = ++generation.current;
    const session = await authApi.register({ ...credentials, email: credentials.email.trim().toLowerCase() });
    if (current !== generation.current) return;
    applySession(session);
    setDialogMode(null);
  }, [applySession, authApi]);

  const logout = useCallback(async () => {
    generation.current += 1;
    clearSession();
    await authApi.logout();
  }, [authApi, clearSession]);

  const value = useMemo<AuthContextValue>(() => ({
    authenticated: user !== null,
    getAccessToken: async () => accessToken.current,
    login,
    logout,
    openLogin: () => setDialogMode("login"),
    openRegister: () => setDialogMode("register"),
    ready,
    refreshAccessToken,
    register,
    user,
  }), [login, logout, ready, refreshAccessToken, register, user]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthDialog
        mode={dialogMode}
        onModeChange={setDialogMode}
        onLogin={login}
        onRegister={register}
      />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
