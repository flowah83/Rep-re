import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_COACH_URL,
  STREAM_QUIET_MS,
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
    expect(normalizeCoachUrl("http://Example.com/Chemin/")).toBe(DEFAULT_COACH_URL);
    expect(normalizeCoachUrl("http://localhost:8787/coach")).toBe("http://localhost:8787/coach");
    expect(normalizeCoachUrl("https://coach.exemple.fr/chemin?token=secret#x")).toBe("https://coach.exemple.fr/chemin");
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

  it("laisse en place l’adresse https et le code déjà enregistrés", () => {
    stubStorage();
    memory.set("repere-coach-url", "https://repere-coach.repere-flo.workers.dev");
    memory.set("repere-coach-token", "code-deja-la");
    expect(loadCoachConfig()).toEqual({ url: DEFAULT_COACH_URL, token: "code-deja-la" });
    expect(memory.get("repere-coach-url")).toBe("https://repere-coach.repere-flo.workers.dev");
    expect(memory.get("repere-coach-token")).toBe("code-deja-la");
    expect(coachIsReady()).toBe(true);
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

  it("n’appelle pas /coach quand le flux ne démarre pas", async () => {
    ready();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/coach")) return new Promise<Response>(() => undefined);
      return await new Promise<Response>((_, reject) => {
        const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) fail();
        else init?.signal?.addEventListener("abort", fail, { once: true });
      });
    });
    await expect(requestCoachStream({ messages: [] }, () => undefined, undefined, { fetchImpl, firstByteMs: 40 })).rejects.toThrow(/pas pu répondre/);
    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([`${DEFAULT_COACH_URL}/coach/stream`]);
  });

  it("n’appelle pas /coach quand le flux ouvert se tait", async () => {
    ready();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/coach")) {
        return new Response(JSON.stringify({ message: { role: "assistant", content: "Secours." } }), { status: 200 });
      }
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"ready":true}\n\n'));
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });
    await expect(requestCoachStream({ messages: [] }, () => undefined, undefined, { fetchImpl, inactivityMs: 40 })).rejects.toThrow(/pas pu répondre/);
    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([`${DEFAULT_COACH_URL}/coach/stream`]);
  });

  it("lit la réponse livrée d’un bloc à la fermeture, comme Safari", async () => {
    ready();
    expect(STREAM_QUIET_MS).toBeGreaterThanOrEqual(45_000);
    const payload = new TextEncoder().encode(
      `: ${" ".repeat(2048)}\ndata: {"ready":true}\n\ndata: {"text":"Oui"}\n\ndata: {"message":{"role":"assistant","content":"Oui"}}\n\n`,
    );
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/coach")) {
        return new Response(JSON.stringify({ message: { role: "assistant", content: "Secours." } }), { status: 200 });
      }
      const response = new Response(new ReadableStream(), { status: 200, headers: { "Content-Type": "text/event-stream" } });
      Object.defineProperty(response, "body", {
        value: {
          getReader() {
            let pending = true;
            return {
              read: async () => {
                if (pending) {
                  pending = false;
                  return { done: true, value: payload };
                }
                return { done: true, value: undefined };
              },
              cancel: async () => undefined,
            };
          },
        },
      });
      return response;
    });
    const seen: string[] = [];
    const result = await requestCoachStream({ messages: [{ role: "user", content: "Test" }] }, (text) => seen.push(text), undefined, { fetchImpl });
    expect(seen).toEqual(["Oui"]);
    expect(result).toMatchObject({ message: { content: "Oui" } });
    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([`${DEFAULT_COACH_URL}/coach/stream`]);
  });

  it("attend la fin d’un flux lent au lieu de basculer vers /coach", async () => {
    ready();
    const encoder = new TextEncoder();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/coach")) return new Promise<Response>(() => undefined);
      const stream = new ReadableStream({
        start(controller) {
          setTimeout(() => {
            controller.enqueue(
              encoder.encode('data: {"ready":true}\n\ndata: {"text":"Oui"}\n\ndata: {"message":{"role":"assistant","content":"Oui"}}\n\n'),
            );
            controller.close();
          }, 50);
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });
    const result = await requestCoachStream({ messages: [] }, () => undefined, undefined, { fetchImpl, inactivityMs: 400 });
    expect(result).toMatchObject({ message: { content: "Oui" } });
    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([`${DEFAULT_COACH_URL}/coach/stream`]);
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
