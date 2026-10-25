/** 天气 Hook：缓存优先渲染 + 30 分钟新鲜期内不重复请求 + 失败降级旧缓存
 *  页面（今日预览 / 我的）共用，避免各自维护一份状态导致重复拉取。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/hooks/useAppData';
import { buildAdvice, fetchWeather, fetchWeatherByLocation, findCity, isFresh, parseCache } from '@/services/weather';
import type { WeatherAdvice, WeatherSnapshot } from '@/types';

/** 定位模式的伪城市 key：存进 settings.weatherCity 后按坐标取区级天气 */
export const LOCATION_CITY_KEY = '@location';

export interface WeatherState {
  /** 当前展示的天气（可能来自缓存）；null = 尚无数据 */
  snapshot: WeatherSnapshot | null;
  advice: WeatherAdvice | null;
  /** 已设置的城市名；空串 = 未选择城市 */
  cityName: string;
  loading: boolean;
  /** 最近一次刷新失败（有缓存时仍展示旧数据） */
  staleError: boolean;
  /** 手动触发刷新（切城市、点「立即刷新」） */
  refresh: (cityKey?: string) => Promise<void>;
}

export function useWeather(): WeatherState {
  const app = useApp();
  const cityKey = app.settings.weatherCity;
  const cached = parseCache(app.settings.weatherCache);

  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(cached);
  const [loading, setLoading] = useState(false);
  const [staleError, setStaleError] = useState(false);
  const mounted = useRef(true);
  const inflight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // 外部缓存变化（导入备份等）时同步展示
  useEffect(() => {
    if (cached && !inflight.current) setSnapshot(cached);
  }, [cached]);

  const doFetch = useCallback(async (key: string) => {
    if (!key || inflight.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      // 定位模式：用真实坐标 + 逆地理区名，比吸附到最近城市精确到区
      const snap = key === LOCATION_CITY_KEY
        ? (await fetchWeatherByLocation())?.snapshot ?? null
        : await fetchWeather(key);
      if (!snap) throw new Error('定位不可用');
      if (!mounted.current) return;
      setSnapshot(snap);
      setStaleError(false);
      await app.setSettings({ weatherCache: JSON.stringify(snap) });
    } catch (error) {
      console.warn('[useWeather] 天气获取失败，保留旧缓存展示', error);
      if (mounted.current) setStaleError(true);
    } finally {
      inflight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [app]);

  // 进入页面即检查：无缓存或缓存过期才请求，新鲜期内直接复用（省流量、防抖）
  useEffect(() => {
    if (!cityKey) return;
    if (cached && isFresh(cached)) return;
    void doFetch(cityKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityKey]);

  const refresh = useCallback(async (overrideKey?: string) => {
    const key = overrideKey ?? cityKey;
    if (!key) return;
    if (overrideKey && overrideKey !== cityKey) {
      await app.setSettings({ weatherCity: overrideKey });
    }
    await doFetch(key);
  }, [cityKey, doFetch, app]);

  const city = findCity(cityKey);
  return {
    snapshot,
    advice: snapshot ? buildAdvice(snapshot) : null,
    cityName: cityKey === LOCATION_CITY_KEY ? (snapshot?.city || '定位') : (city?.name ?? ''),
    loading,
    staleError,
    refresh,
  };
}
