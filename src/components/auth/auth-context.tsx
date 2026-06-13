"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase-client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("init");

  useEffect(() => {
    const hash = window.location.hash;

    const init = async () => {
      // Raw fetch test
      try {
        const res = await fetch(
          process.env.NEXT_PUBLIC_SUPABASE_URL! + "/auth/v1/settings",
        );
        setStatus((prev) => prev + " | rawFetch: " + res.status);
      } catch (e: any) {
        setStatus((prev) => prev + " | rawFetch FAIL: " + (e?.message || String(e)));
      }

      if (hash && hash.includes("access_token")) {
        setStatus("hash detected, parsing...");
        try {
          const params = new URLSearchParams(hash.substring(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          const expires_at = params.get("expires_at");

          if (access_token && refresh_token) {
            setStatus("calling setSession...");
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) {
              setStatus("setSession error: " + error.message);
            } else {
              setStatus("setSession OK, user=" + (!!data?.user));
              window.history.replaceState({}, "", "/");
            }
          } else {
            setStatus("missing access_token or refresh_token");
          }
        } catch (err: any) {
          setStatus("exception: " + err?.message);
        }
      }

      setStatus((prev) => prev + " | getSession...");
      const { data: { session: s } } = await supabase.auth.getSession();
      setStatus((prev) => prev + " session=" + (!!s));
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    };

    init();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ user, session, loading, signInWithGoogle, signOut }),
    [user, session, loading, signInWithGoogle, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, background: "#ffc", padding: 4, fontSize: 10, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
        {status}
      </div>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
