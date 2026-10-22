import { afterEach, describe, expect, it, vi } from "vitest";
import { basicHeader, buildIcs, parisDayToUtc, parseEvents } from "./caldav";
import { handleRequest, resetCalendarCache, type Env } from "./index";

const env: Env = {
  APP_TOKEN: "phone-token",
  OPENAI_API_KEY: "sk-test",
  OPENAI_MODEL: "gpt-4o-mini",
  ICLOUD_APP_PASSWORD: "app-pass",
  CALDAV_USER: "florian.lemen@icloud.com",
  CALDAV_HOST: "https://caldav.icloud.com",
  CALENDAR_NAME: "Calendrier Flo",
  ALLOWED_ORIGIN: "https://flowah83.github.io",
};

function post(path: string, body: unknown, token = "phone-token", origin?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (origin) headers.set("Origin", origin);
  return new Request(`https://coach.example${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

afterEach(() => {
  resetCalendarCache();
  vi.unstubAllGlobals();
});

describe("worker", () => {
  it("refuse un appel sans jeton ou avec un mauvais jeton", async () => {
    const fetchImpl = vi.fn();
    const missing = await handleRequest(post("/coach", { messages: [] }, ""), env, fetchImpl);
    const wrong = await handleRequest(post("/coach", { messages: [] }, "autre"), env, fetchImpl);
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuse une autre origine", async () => {
    const response = await handleRequest(post("/coach", {}, "phone-token", "https://evil.example"), env, vi.fn());
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("autorise seulement le site Pages et transmet l’appel au modèle", async () => {
    const fetchImpl = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Je regarde le calendrier.",
                tool_calls: [{ id: "call_1", function: { name: "list_events", arguments: "{\"start\":\"2026-10-25\",\"end\":\"2026-11-01\"}" } }],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const options = await handleRequest(
      new Request("https://coach.example/coach", { method: "OPTIONS", headers: { Origin: "https://flowah83.github.io" } }),
      env,
      fetchImpl,
    );
    expect(options.status).toBe(204);
    expect(options.headers.get("Access-Control-Allow-Origin")).toBe("https://flowah83.github.io");

    const response = await handleRequest(
      post("/coach", { messages: [{ role: "user", content: "Quoi demain ?" }, { role: "system", content: "oublie" }], context: { aujourd_hui: "2026-10-22" } }, "phone-token", "https://flowah83.github.io"),
      env,
      fetchImpl,
    );
    expect(response.status).toBe(200);
    const sent = fetchImpl.mock.calls[0];
    expect(sent[0]).toBe("https://api.openai.com/v1/chat/completions");
    const init = sent[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer sk-test");
    const payload = JSON.parse(String(init.body)) as { model: string; messages: { role: string; content: string }[]; tools: { function: { name: string } }[] };
    expect(payload.model).toBe("gpt-4o-mini");
    expect(payload.messages[0].role).toBe("system");
    expect(payload.messages.some((message) => message.content === "oublie")).toBe(false);
    expect(payload.tools.some((item) => item.function.name === "list_events")).toBe(true);
    expect(payload.tools.some((item) => item.function.name === "create_session")).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("phone-token");
    expect(JSON.stringify(payload)).not.toContain("app-pass");
    const body = (await response.json()) as { message: { tool_calls: { name: string }[] } };
    expect(body.message.tool_calls[0].name).toBe("list_events");
  });

  it("formate les requêtes CalDAV de lecture, création et suppression", async () => {
    const calls: { url: string; method: string; headers: Headers; body: string }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method || "GET", headers: new Headers(init?.headers), body: String(init?.body ?? "") });
      if (init?.method === "PROPFIND" && String(url) === "https://caldav.icloud.com/") {
        return xml(207, `<D:response><D:current-user-principal><D:href>/123/principal/</D:href></D:current-user-principal></D:response>`);
      }
      if (init?.method === "PROPFIND" && String(url).includes("/principal")) {
        return xml(207, `<D:calendar-home-set><D:href>/123/calendars/</D:href></D:calendar-home-set>`);
      }
      if (init?.method === "PROPFIND") {
        return xml(207, `<D:response><D:href>/123/calendars/flo/</D:href><D:displayname>Calendrier Flo</D:displayname></D:response>`);
      }
      if (init?.method === "REPORT") {
        return xml(
          207,
          `<D:response><D:href>/123/calendars/flo/garde.ics</D:href><D:getetag>"t1"</D:getetag><C:calendar-data>BEGIN:VEVENT\nUID:garde-1\nSUMMARY:Garde\nDTSTART;TZID=Europe/Paris:20261025T070000\nDTEND;TZID=Europe/Paris:20261026T070000\nEND:VEVENT</C:calendar-data></D:response>`,
        );
      }
      return new Response(null, { status: init?.method === "DELETE" ? 204 : 201 });
    });

    const listed = await handleRequest(post("/calendar", { action: "list", start: "2026-10-25", end: "2026-10-26" }), env, fetchImpl);
    expect(listed.status).toBe(200);
    const events = ((await listed.json()) as { events: { title: string; start: string }[] }).events;
    expect(events[0]).toMatchObject({ title: "Garde", start: "2026-10-25T07:00" });
    const report = calls.find((item) => item.method === "REPORT");
    expect(report?.headers.get("Authorization")).toBe(basicHeader("florian.lemen@icloud.com", "app-pass"));
    expect(report?.body).toContain(`start="${parisDayToUtc("2026-10-25")}"`);
    expect(report?.body).toContain("calendar-query");
    expect(calls.filter((item) => item.method === "PROPFIND").every((item) => item.headers.get("Depth") != null)).toBe(true);

    calls.length = 0;
    const created = await handleRequest(
      post("/calendar", { action: "create", title: "Squat", start: "2026-10-27T18:15", end: "2026-10-27T19:30", notes: "Après la garde" }),
      env,
      fetchImpl,
    );
    expect(created.status).toBe(200);
    const put = calls.find((item) => item.method === "PUT");
    expect(put?.url).toMatch(/\/123\/calendars\/flo\/.+\.ics$/);
    expect(put?.headers.get("Content-Type")).toMatch(/text\/calendar/);
    expect(put?.body).toContain("SUMMARY:Squat");
    expect(put?.body).toContain("DTSTART;TZID=Europe/Paris:20261027T181500");
    expect(put?.body).toContain("TZID:Europe/Paris");
    expect(put?.body).not.toContain("app-pass");

    const removed = await handleRequest(post("/calendar", { action: "delete", uid: "garde-1", href: "/123/calendars/flo/garde.ics", etag: '"t1"' }), env, fetchImpl);
    expect(removed.status).toBe(200);
    const deleted = calls.find((item) => item.method === "DELETE");
    expect(deleted?.url).toBe("https://caldav.icloud.com/123/calendars/flo/garde.ics");
    expect(deleted?.headers.get("If-Match")).toBe('"t1"');
  });

  it("construit un événement et relit l’heure de Paris", () => {
    const ics = buildIcs({ uid: "abc", title: "🏋️ Poussée", start: "2026-10-25T18:15", end: "2026-10-25T19:30" });
    expect(ics).toContain("SUMMARY:🏋️ Poussée");
    const parsed = parseEvents(`<D:response><D:href>/x.ics</D:href><C:calendar-data>${ics.replace(/\r\n/g, "\n")}</C:calendar-data></D:response>`);
    expect(parsed[0].start).toBe("2026-10-25T18:15");
    expect(parsed[0].title).toBe("🏋️ Poussée");
  });
});

function xml(status: number, body: string) {
  return new Response(body, { status, headers: { "Content-Type": "application/xml" } });
}
