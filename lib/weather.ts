export const TOULON = { latitude: 43.1242, longitude: 5.928, timezone: "Europe/Paris" };
export const WEATHER_TTL_MS = 30 * 60 * 1000;
export const WEATHER_KEY = "repere-weather-toulon";

export type WeatherSnapshot = {
  temp: number;
  code: number;
  min: number | null;
  max: number | null;
  at: number;
};

export type WeatherStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type WeatherResult = {
  snapshot: WeatherSnapshot | null;
  stale: boolean;
};

export function weatherUrl(): string {
  const query = new URLSearchParams({
    latitude: String(TOULON.latitude),
    longitude: String(TOULON.longitude),
    current: "temperature_2m,weather_code",
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: TOULON.timezone,
    forecast_days: "1",
  });
  return `https://api.open-meteo.com/v1/forecast?${query}`;
}

export function readWeather(store: WeatherStore | null): WeatherSnapshot | null {
  if (!store) return null;
  try {
    const raw = store.getItem(WEATHER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeWeather(store: WeatherStore | null, snapshot: WeatherSnapshot) {
  if (!store) return;
  try {
    store.setItem(WEATHER_KEY, JSON.stringify(snapshot));
  } catch {
    /* stockage privé */
  }
}

/** Libellé court, à partir du code météo Open-Meteo. */
export function weatherCondition(code: number): string {
  if (code === 0) return "Ensoleillé";
  if (code === 1) return "Plutôt clair";
  if (code === 2) return "Nuageux";
  if (code === 3) return "Couvert";
  if (code === 45 || code === 48) return "Brouillard";
  if (code >= 51 && code <= 57) return "Bruine";
  if (code >= 61 && code <= 67) return "Pluie";
  if (code >= 71 && code <= 77) return "Neige";
  if (code >= 80 && code <= 82) return "Averses";
  if (code >= 85 && code <= 86) return "Neige";
  if (code >= 95) return "Orage";
  return "Variable";
}

export function weatherFresh(snapshot: WeatherSnapshot, now: number): boolean {
  return now - snapshot.at < WEATHER_TTL_MS && now >= snapshot.at;
}

/**
 * Garde la dernière valeur 30 minutes. Hors ligne, ou si l’appel échoue, on rend le cache.
 * Rien en cache et pas de réseau : null, pour que l’écran se taise plutôt qu’il affiche une erreur.
 */
export async function loadWeather(options: {
  store: WeatherStore | null;
  now: number;
  online: boolean;
  fetchImpl?: typeof fetch;
}): Promise<WeatherResult> {
  const cached = readWeather(options.store);
  if (cached && weatherFresh(cached, options.now)) return { snapshot: cached, stale: false };
  if (!options.online) return { snapshot: cached, stale: Boolean(cached) };
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(weatherUrl());
    if (!response.ok) return { snapshot: cached, stale: Boolean(cached) };
    const body = (await response.json()) as unknown;
    const snapshot = parseWeather(body, options.now);
    if (!snapshot) return { snapshot: cached, stale: Boolean(cached) };
    writeWeather(options.store, snapshot);
    return { snapshot, stale: false };
  } catch {
    return { snapshot: cached, stale: Boolean(cached) };
  }
}

export function parseWeather(body: unknown, now: number): WeatherSnapshot | null {
  if (!body || typeof body !== "object") return null;
  const current = (body as { current?: unknown }).current;
  const daily = (body as { daily?: unknown }).daily;
  if (!current || typeof current !== "object") return null;
  const temp = (current as { temperature_2m?: unknown }).temperature_2m;
  const code = (current as { weather_code?: unknown }).weather_code;
  if (typeof temp !== "number" || !Number.isFinite(temp)) return null;
  if (typeof code !== "number" || !Number.isFinite(code)) return null;
  const min = dailyNumber(daily, "temperature_2m_min");
  const max = dailyNumber(daily, "temperature_2m_max");
  return { temp: Math.round(temp), code, min, max, at: now };
}

function dailyNumber(daily: unknown, key: "temperature_2m_min" | "temperature_2m_max"): number | null {
  if (!daily || typeof daily !== "object") return null;
  const list = (daily as Record<string, unknown>)[key];
  const value = Array.isArray(list) ? list[0] : null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function isSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as WeatherSnapshot;
  return typeof snap.temp === "number" && typeof snap.code === "number" && typeof snap.at === "number";
}
