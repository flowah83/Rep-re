import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COACH_URL,
  coachIsReady,
  loadCoachConfig,
  normalizeCoachUrl,
  requestCoach,
  requestCoachStream,
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
      vi.fn(async (input) => {
        expect(String(input)).toBe(`${DEFAULT_COACH_URL}/health`);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    expect(ok).toMatchObject({ ok: true, message: "Connexion OK.", url: DEFAULT_COACH_URL });

    const missing = await testCoachConnection(
      { url: DEFAULT_COACH_URL, token: "secret" },
      vi.fn(async () => new Response(JSON.stringify({ error: "Adresse inconnue." }), { status: 404 })),
    );
    expect(missing.ok).toBe(false);
    expect(missing.message).toBe("Cette adresse ne répond pas.");

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

describe("requestCoachStream", () => {
  function ready() {
    stubStorage();
    saveCoachConfig({ url: DEFAULT_COACH_URL, token: "secret" });
  }

  it("retombe sur /coach si le flux répond 404", async () => {
    ready();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/coach/stream")) return new Response("missing", { status: 404 });
      return new Response(JSON.stringify({ message: { role: "assistant", content: "Par /coach." } }), { status: 200 });
    });
    const result = await requestCoachStream({ messages: [] }, () => undefined, undefined, { fetchImpl });
    expect(result).toMatchObject({ message: { content: "Par /coach." } });
  });

  it("retombe sur /coach si aucun octet n’arrive", async () => {
    ready();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/coach/stream")) {
        return await new Promise<Response>((_, reject) => {
          const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          if (init?.signal?.aborted) fail();
          else init?.signal?.addEventListener("abort", fail, { once: true });
        });
      }
      return new Response(JSON.stringify({ message: { role: "assistant", content: "Secours." } }), { status: 200 });
    });
    const result = await requestCoachStream({ messages: [] }, () => undefined, undefined, { fetchImpl, firstByteMs: 40 });
    expect(result).toMatchObject({ message: { content: "Secours." } });
  });

  it("retombe sur /coach si le flux se tait", async () => {
    ready();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/coach/stream")) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"ready":true}\n\n'));
          },
        });
        return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({ message: { role: "assistant", content: "Secours." } }), { status: 200 });
    });
    const result = await requestCoachStream({ messages: [] }, () => undefined, undefined, { fetchImpl, inactivityMs: 40 });
    expect(result).toMatchObject({ message: { content: "Secours." } });
  });

  it("laisse passer le texte puis le message", async () => {
    ready();
    const seen: string[] = [];
    const fetchImpl = vi.fn(async () =>
      new Response(
        'data: {"ready":true}\n\ndata: {"text":"Bon"}\n\ndata: {"text":"Bonjour"}\n\ndata: {"message":{"role":"assistant","content":"Bonjour"}}\n\n',
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    const result = await requestCoachStream({ messages: [] }, (text) => seen.push(text), undefined, { fetchImpl });
    expect(seen).toEqual(["Bon", "Bonjour"]);
    expect(result).toMatchObject({ message: { content: "Bonjour" } });
  });

  it("ne rappelle pas /coach quand la personne arrête", async () => {
    ready();
    const fetchImpl = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(requestCoachStream({ messages: [] }, () => undefined, controller.signal, { fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
