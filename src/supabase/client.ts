/**
 * 云同步后端：自建 Supabase（2026-10-26 迁移）
 * 项目: bpvixkxsbcnpmbydeyiz（东南亚-新加坡）
 * 说明: 数据库结构由仓库根目录 migration.sql 创建（4 表 + RLS 策略）
 * 注意: 本文件含公开的 anon key（仅能访问 RLS 放行的数据），service_role 密钥严禁写入。
 */

import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}

export const supabaseUrl = "https://bpvixkxsbcnpmbydeyiz.supabase.co";
export const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwdml4a3hzYmNucG1ieWRleWl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMDE2MTYsImV4cCI6MjEwODU3NzYxNn0.bGwvH2hBTrazyUVcDRNm9KH4MKjwYSXzaVjuD6kqlvA";

const PlatformStorageAdapter = {
  getItem: (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try {
        return Promise.resolve(
          typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
        );
      } catch {
        return Promise.resolve(null);
      }
    }
    const SecureStore = require('expo-secure-store');
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      } catch {
        // Ignore unavailable browser storage.
      }
      return Promise.resolve();
    }
    const SecureStore = require('expo-secure-store');
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      } catch {
        // Ignore unavailable browser storage.
      }
      return Promise.resolve();
    }
    const SecureStore = require('expo-secure-store');
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: PlatformStorageAdapter,
  },
});
