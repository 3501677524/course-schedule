/** 云端账号上下文：监听 supabase 会话，向全 App 暴露当前登录手机号 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getCurrentSession, onAuthChange } from '@/services/cloudSync';

interface AuthState {
  /** null = 未登录；有值时会话由 supabase（expo-secure-store）自动持久化 */
  session: Session | null;
  /** 登录标识（手机号），来自 user_metadata.username */
  phone: string;
  authReady: boolean;
}

const EMPTY: AuthState = { session: null, phone: '', authReady: false };
const Ctx = createContext<AuthState>(EMPTY);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // ⚠️ onAuthStateChange 回调内禁止直接发起 Supabase 请求（会死锁），只做 setState
    let alive = true;
    void getCurrentSession()
      .then((s) => {
        if (!alive) return;
        setSession(s);
        setAuthReady(true);
        console.info(`[auth] 初始会话恢复：${s?.user ? '已登录' : '未登录'}`);
      })
      .catch((e) => {
        console.warn('[auth] 初始会话读取失败', e);
        if (alive) setAuthReady(true);
      });
    const off = onAuthChange((s) => {
      if (!alive) return;
      setSession(s);
      setAuthReady(true);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const phone = (session?.user.user_metadata?.username as string | undefined) ?? '';
  return <Ctx.Provider value={{ session, phone, authReady }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(Ctx);
}
