/** 天气服务：Open-Meteo 免密钥实时天气 + WMO 天气码中文映射 + 生活建议（带伞/穿衣）
 *
 * - 数据源：https://api.open-meteo.com（无需 API key）
 * - 城市：预置 12 个高校聚集城市；可选用 expo-location 反查最近城市
 * - 缓存：WeatherSnapshot JSON 存 settings.weatherCache，30 分钟内直接复用，失败降级旧缓存
 */
import * as Location from 'expo-location';
import type { WeatherAdvice, WeatherSnapshot } from '@/types';

/** 向用户请求一次定位（权限拒绝/超时等返回 null，不抛错） */
async function requestPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      console.warn('[weather] 定位权限被拒，回退手动选城市');
      return null;
    }
    let pos = await Location.getLastKnownPositionAsync();
    try {
      pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch (error) {
      console.warn('[weather] 实时定位不可用，尝试使用最后已知位置', error);
    }
    if (!pos) {
      console.warn('[weather] 定位结果为空，回退手动选城市');
      return null;
    }
    return pos.coords;
  } catch (error) {
    console.warn('[weather] 定位不可用，回退手动选城市', error);
    return null;
  }
}

interface GeoResponse {
  data?: Array<{ city?: unknown; province?: unknown; lat?: unknown; lon?: unknown }>;
}

/** 逆地理编码：把经纬度解析成「XX市·XX区」样式的标签（BigDataCloud 免密钥，失败返回 null） */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal as never });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const json = (await res.json()) as GeoResponse;
      const row = json.data?.[0];
      if (!row) return null;
      const parts = [row.city, row.province]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v && !/^\d+(\.\d+)?$/.test(v));
      const label = Array.from(new Set(parts)).join('·');
      console.info(`[weather] 逆地理编码结果：${label || '未命中'}`);
      return label || null;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.warn('[weather] 逆地理编码失败，仅按坐标取天气', error);
    return null;
  }
}

export interface CoordinateWeather {
  /** 展示标签，如「杭州市·西湖区」；逆地理失败时为「当前定位」 */
  label: string;
  snapshot: WeatherSnapshot;
}

/** 按定位坐标直接取区级天气：先逆地理拿到区名，再用原始坐标请求 Open-Meteo */
export async function fetchWeatherByLocation(): Promise<CoordinateWeather | null> {
  const pos = await requestPosition();
  if (!pos) return null;
  const label = (await reverseGeocode(pos.latitude, pos.longitude)) ?? '当前定位';
  const snap = await fetchAtCoords(label, pos.latitude, pos.longitude);
  console.info(`[weather] 区级天气已获取：${label} ${snap.temp}℃ ${snap.text}`);
  return { label, snapshot: snap };
}

/** 缓存新鲜期：30 分钟 */
export const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;

export interface CityPreset {
  key: string;
  name: string;
  lat: number;
  lon: number;
}

/** 预置城市（高校聚集地），key 稳定用于 settings.weatherCity 存储 */
export const CITY_PRESETS: CityPreset[] = [
  { key: 'beijing', name: '北京', lat: 39.9042, lon: 116.4074 },
  { key: 'shanghai', name: '上海', lat: 31.2304, lon: 121.4737 },
  { key: 'guangzhou', name: '广州', lat: 23.1291, lon: 113.2644 },
  { key: 'shenzhen', name: '深圳', lat: 22.5431, lon: 114.0579 },
  { key: 'nanjing', name: '南京', lat: 32.0603, lon: 118.7969 },
  { key: 'wuhan', name: '武汉', lat: 30.5928, lon: 114.3055 },
  { key: 'hangzhou', name: '杭州', lat: 30.2741, lon: 120.1551 },
  { key: 'chengdu', name: '成都', lat: 30.5728, lon: 104.0668 },
  { key: 'xian', name: '西安', lat: 34.3416, lon: 108.9398 },
  { key: 'chongqing', name: '重庆', lat: 29.563, lon: 106.5516 },
  { key: 'changsha', name: '长沙', lat: 28.2282, lon: 112.9388 },
  { key: 'harbin', name: '哈尔滨', lat: 45.8038, lon: 126.535 },
];

export function findCity(key: string): CityPreset | null {
  return CITY_PRESETS.find((c) => c.key === key) ?? null;
}

/** WMO 天气码 -> 中文描述 */
const WMO_TEXT: Record<number, string> = {
  0: '晴',
  1: '基本晴朗',
  2: '局部多云',
  3: '阴',
  45: '雾',
  48: '雾凇雾',
  51: '毛毛雨',
  53: '毛毛雨',
  55: '毛毛雨',
  56: '冻毛毛雨',
  57: '冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '阵雨',
  81: '强阵雨',
  82: '暴阵雨',
  85: '阵雪',
  86: '强阵雪',
  95: '雷阵雨',
  96: '雷阵雨伴冰雹',
  99: '雷阵雨伴强冰雹',
};

export function weatherCodeText(code: number): string {
  return WMO_TEXT[code] ?? '未知';
}

/** 是否降水类天气码（用于带伞判断的兜底） */
function isRainyCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

interface OpenMeteoResponse {
  current?: { temperature_2m?: unknown; relative_humidity_2m?: unknown; weather_code?: unknown; wind_speed_10m?: unknown };
  daily?: {
    temperature_2m_max?: unknown[];
    temperature_2m_min?: unknown[];
    precipitation_probability_max?: unknown[];
  };
}

/** 外部数据边界归一化：任何字段非法即返回 null，禁止断言后直接读取 */
function normalizeSnapshot(city: string, raw: unknown): WeatherSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as OpenMeteoResponse;
  const cur = data.current;
  const daily = data.daily;
  if (!cur || !daily) return null;
  const temp = Number(cur.temperature_2m);
  const code = Number(cur.weather_code);
  const humidity = Number(cur.relative_humidity_2m);
  const windSpeed = Number(cur.wind_speed_10m);
  const tempMax = Number(Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : NaN);
  const tempMin = Number(Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : NaN);
  const rainChance = Number(Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max[0] : NaN);
  if (![temp, code, tempMax, tempMin].every((n) => Number.isFinite(n))) return null;
  return {
    city,
    temp: Math.round(temp),
    tempMin: Math.round(tempMin),
    tempMax: Math.round(tempMax),
    code: Math.round(code),
    text: weatherCodeText(Math.round(code)),
    humidity: Number.isFinite(humidity) ? Math.round(humidity) : 0,
    windSpeed: Number.isFinite(windSpeed) ? Math.round(windSpeed) : 0,
    rainChance: Number.isFinite(rainChance) ? Math.max(0, Math.min(100, Math.round(rainChance))) : 0,
    fetchedAt: new Date().toISOString(),
  };
}

/** 解析缓存 JSON；结构非法时安全返回 null */
export function parseCache(json: string): WeatherSnapshot | null {
  if (!json) return null;
  try {
    const obj: unknown = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return null;
    const v = obj as Record<string, unknown>;
    const fields = [v.city, v.temp, v.tempMin, v.tempMax, v.code, v.text, v.humidity, v.windSpeed, v.rainChance, v.fetchedAt];
    if (typeof fields[0] !== 'string' || typeof fields[5] !== 'string' || typeof fields[9] !== 'string') return null;
    if (!fields.slice(1, 5).concat(fields.slice(6, 9)).every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    return obj as WeatherSnapshot;
  } catch {
    console.warn('[weather] 缓存解析失败，忽略旧缓存');
    return null;
  }
}

export function isFresh(snap: WeatherSnapshot): boolean {
  const at = Date.parse(snap.fetchedAt);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < WEATHER_CACHE_TTL_MS;
}

/** 拉取指定城市今日天气；超时 8 秒，失败抛错由调用方降级 */
export async function fetchWeather(cityKey: string): Promise<WeatherSnapshot> {
  const city = findCity(cityKey);
  if (!city) throw new Error(`unknown city: ${cityKey}`);
  return fetchAtCoords(city.name, city.lat, city.lon);
}

/** 按任意坐标拉取天气（预置城市与区级定位共用同一套解析逻辑） */
async function fetchAtCoords(label: string, lat: number, lon: number): Promise<WeatherSnapshot> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=Asia%2FShanghai';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal as never });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const snap = normalizeSnapshot(label, await res.json());
    if (!snap) throw new Error('bad payload');
    console.info(`[weather] ${label} 今日 ${snap.temp}℃ ${snap.text} 降水概率${snap.rainChance}%`);
    return snap;
  } finally {
    clearTimeout(timer);
  }
}

/** 由天气派生生活建议：带伞、穿衣、综合一句话 */
export function buildAdvice(snap: WeatherSnapshot): WeatherAdvice {
  const umbrella = snap.rainChance >= 40 || isRainyCode(snap.code);
  const t = snap.temp;
  let clothing: string;
  if (t <= 5) clothing = '气温低，羽绒服/厚棉服 + 围巾手套';
  else if (t <= 12) clothing = '偏冷，建议毛衣加外套';
  else if (t <= 20) clothing = '凉爽，长袖外套即可';
  else if (t <= 27) clothing = '舒适，长袖或薄 T 恤';
  else clothing = '炎热，短袖防晒，注意补水';
  const parts: string[] = [];
  parts.push(`${snap.city}今日 ${snap.tempMin}~${snap.tempMax}℃，${snap.text}`);
  if (umbrella) parts.push(`降水概率 ${snap.rainChance}%，出门记得带伞`);
  if (snap.windSpeed >= 30) parts.push(`风力较大（${snap.windSpeed}km/h）`);
  if (snap.humidity >= 85 && !umbrella) parts.push('湿度偏高，体感闷热');
  return { umbrella, clothing, summary: parts.join(' · ') };
}
