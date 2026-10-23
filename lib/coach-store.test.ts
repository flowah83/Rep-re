import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COACH_URL,
  coachIsReady,
  loadCoachConfig,
  normalizeCoachUrl,
  requestCoach,
  saveCoachConfig,
  testCoachConnection,
} from "./coach-store";

const memory = new Map<string, string>();

afterEach(() => {
  memory.clear();
  vi.unstubAllGlobals();
});

function stubStorage() {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
  });
}

describe("normalizeCoachUrl", () => {
  it("nettoie la saisie iPhone et retombe sur l’adresse du service", () => {
    expect(normalizeCoachUrl("  HTTPS://Repere-Coach.Repere-Flo.workers.dev/ ")).toBe(DEFAULT_COACH_URL);
    expect(normalizeCoachUrl("repere-coach.repere-flo .workers.dev")).toBe(DEFAULT_COACH_URL);
    expect(normalizeCoachUrl("")).toBe(DEFAULT_COACH_URL);
    expect(normalizeCoachUrl("   ")).toBe(DEFAULT_COACH_URL);
    expect(normalizeCoachUrl("https://")).toBe(DEFAULT_COACH_URL);
    expect(normalizeCoachUrl("javascript:alert(1)")).toBe(DEFAULT_COACH_URL);
    expect(normalizeCoachUrl("http://Example.com/Chemin/")).toBe("http://example.com/Chemin");
  });
});

describe("coach config", () => {
  it("rend le code suffisant et ignore une adresse illisible déjà enregistrée", () => {
    stubStorage();
    saveCoachConfig({ url: "HTTPS://Repere-Coach.Repere-Flo.workers.dev/", token: "  secret  " });
    expect(loadCoachConfig()).toEqual({ url: DEFAULT_COACH_URL, token: "secret" });
    expect(coachIsReady()).toBe(true);
    saveCoachConfig({ url: "pas une adresse://", token: "secret" });
    expect(loadCoachConfig().url).toBe(DEFAULT_COACH_URL);
    saveCoachConfig({ url: DEFAULT_COACH_URL, token: "   " });
    expect(coachIsReady()).toBe(false);
  });
});

describe("testCoachConnection", () => {
  it("distingue une connexion OK, un code refusé et un serveur injoignable", async () => {
    const ok = await testCoachConnection(
      { url: " HTTPS://Repere-Coach.Repere-Flo.workers.dev/ ", token: " bon " },
      vi.fn(async () => new Response(JSON.stringify({ error: "Adresse inconnue." }), { status: 404 })),
    );
    expect(ok).toMatchObject({ ok: true, message: "Connexion OK.", url: DEFAULT_COACH_URL });

    const denied = await testCoachConnection(
      { url: DEFAULT_COACH_URL, token: "mauvais" },
      vi.fn(async () => new Response(JSON.stringify({ error: "Accès refusé." }), { status: 401 })),
    );
    expect(denied.message).toBe("Code refusé (401).");

    const down = await testCoachConnection(
      { url: "repere-coach.repere-flo.workers.dev", token: "secret" },
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(down.ok).toBe(false);
    expect(down.message).toBe(`Serveur injoignable. Adresse utilisée : ${DEFAULT_COACH_URL}`);
  });
});

describe("requestCoach", () => {
  it("indique l’adresse utilisée quand le réseau échoue", async () => {
    stubStorage();
    saveCoachConfig({ url: "HTTPS://Repere-Coach.Repere-Flo.workers.dev/", token: "secret" });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(requestCoach("/coach", { messages: [] }, fetchImpl)).rejects.toThrow(
      `Le coach n’est pas joignable. Adresse utilisée : ${DEFAULT_COACH_URL}`,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      `${DEFAULT_COACH_URL}/coach`,
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer secret" }) }),
    );
  });
});
