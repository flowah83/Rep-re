import { describe, expect, it } from "vitest";
import { WEATHER_KEY, WEATHER_TTL_MS, loadWeather, parseWeather, readWeather, weatherCondition, weatherVariantFromSearch, type WeatherStore } from "./weather";

function memory(initial?: string): WeatherStore & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  if (initial) raw.set(WEATHER_KEY, initial);
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
  };
}

const body = {
  current: { temperature_2m: 21.4, weather_code: 1 },
  daily: { temperature_2m_max: [24.2], temperature_2m_min: [16.6] },
};

describe("météo de Toulon", () => {
  it("nomme le temps et choisit la variante", () => {
    expect(weatherCondition(0)).toBe("Ensoleillé");
    expect(weatherCondition(61)).toBe("Pluie");
    expect(weatherCondition(95)).toBe("Orage");
    expect(weatherVariantFromSearch("")).toBe("tile");
    expect(weatherVariantFromSearch("?meteo=b")).toBe("line");
    expect(weatherVariantFromSearch("?meteo=widget")).toBe("widget");
  });

  it("lit une réponse Open-Meteo", () => {
    expect(parseWeather(body, 1000)).toEqual({ temp: 21, code: 1, min: 17, max: 24, at: 1000 });
    expect(parseWeather({ current: {} }, 1)).toBeNull();
  });

  it("garde le cache frais sans rappeler le réseau", async () => {
    const store = memory(JSON.stringify({ temp: 18, code: 0, min: 14, max: 20, at: 5_000 }));
    let called = 0;
    const result = await loadWeather({
      store,
      now: 5_000 + WEATHER_TTL_MS - 1,
      online: true,
      fetchImpl: async () => {
        called += 1;
        return new Response("no");
      },
    });
    expect(called).toBe(0);
    expect(result.stale).toBe(false);
    expect(result.snapshot?.temp).toBe(18);
  });

  it("rafraîchit un cache périmé, puis le réécrit", async () => {
    const store = memory(JSON.stringify({ temp: 10, code: 3, min: 8, max: 12, at: 0 }));
    const result = await loadWeather({
      store,
      now: WEATHER_TTL_MS + 1,
      online: true,
      fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 }),
    });
    expect(result.snapshot?.temp).toBe(21);
    expect(result.stale).toBe(false);
    expect(readWeather(store)?.temp).toBe(21);
  });

  it("hors ligne, rend la dernière valeur et n’invente rien s’il n’y en a pas", async () => {
    const store = memory(JSON.stringify({ temp: 19, code: 2, min: 15, max: 22, at: 0 }));
    const stale = await loadWeather({ store, now: WEATHER_TTL_MS + 5, online: false, fetchImpl: async () => { throw new Error("réseau"); } });
    expect(stale).toEqual({ snapshot: { temp: 19, code: 2, min: 15, max: 22, at: 0 }, stale: true });
    const empty = await loadWeather({ store: memory(), now: 10, online: false });
    expect(empty).toEqual({ snapshot: null, stale: false });
  });

  it("si l’appel échoue, garde le cache sans lever d’erreur", async () => {
    const store = memory(JSON.stringify({ temp: 12, code: 61, min: 9, max: 13, at: 0 }));
    const failed = await loadWeather({
      store,
      now: WEATHER_TTL_MS + 5,
      online: true,
      fetchImpl: async () => new Response("no", { status: 503 }),
    });
    expect(failed.snapshot?.temp).toBe(12);
    expect(failed.stale).toBe(true);
    const thrown = await loadWeather({
      store: memory(),
      now: 10,
      online: true,
      fetchImpl: async () => { throw new Error("coupé"); },
    });
    expect(thrown.snapshot).toBeNull();
  });
});
