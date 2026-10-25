/** 云端账号上下文：监听 supabase 会话，向全 App 暴露登录标识（学号/账号）与用户名 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getCurrentSession, getProfileDisplayName, onAuthChange } from '@/services/cloudSync';

interface AuthState {
  /** null = 未登录；有值时会话由 supabase（expo-secure-store）自动持久化 */
  session: Session | null;
  /** 登录标识（学号 / 账号），来自 user_metadata.username */
  account: string;
  /** 用户名（显示名），来自 user_metadata.display_name，缺失时回退 profiles.display_name */
  displayName: string;
  authReady: boolean;
}

const EMPTY: AuthState = { session: null, account: '', displayName: '', authReady: false };
const Ctx = createContext<AuthState>(EMPTY);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  /** 元数据里没有 display_name 时（老账号 / trigger 未更新）从 profiles 兜底读到的名字 */
  const [profileName, setProfileName] = useState('');

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

  const account = (session?.user.user_metadata?.username as string | undefined) ?? '';
  const metaName = (session?.user.user_metadata?.display_name as string | undefined) ?? '';

  // 元数据缺用户名时，登录后异步从 profiles 兜底读一次（失败静默，不影响主流程）
  useEffect(() => {
    if (!session?.user || metaName) {
      setProfileName('');
      return;
    }
    let alive = true;
    void getProfileDisplayName()
      .then((n) => {
        if (alive && n) setProfileName(n);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [session?.user, metaName]);

  const displayName = metaName || profileName || account;
  return <Ctx.Provider value={{ session, account, displayName, authReady }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(Ctx);
}