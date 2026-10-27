export type HttpCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export type CalendarEvent = {
  uid: string;
  href: string;
  etag: string;
  title: string;
  start: string;
  end: string;
};

const PRINCIPAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:current-user-principal/></D:prop></D:propfind>`;

const HOME_XML = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"><D:prop><C:calendar-home-set/></D:prop></D:propfind>`;

const LIST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:displayname/><D:resourcetype/></D:prop></D:propfind>`;

export function basicHeader(user: string, password: string): string {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

export function propfindCall(url: string, depth: 0 | 1, kind: "principal" | "home" | "list", auth: string): HttpCall {
  const body = kind === "principal" ? PRINCIPAL_XML : kind === "home" ? HOME_XML : LIST_XML;
  return {
    url,
    method: "PROPFIND",
    headers: {
      Authorization: auth,
      Depth: String(depth),
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
  };
}

export function reportCall(calendarUrl: string, startUtc: string, endUtc: string, auth: string): HttpCall {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">
    <C:time-range start="${startUtc}" end="${endUtc}"/>
  </C:comp-filter></C:comp-filter></C:filter>
</C:calendar-query>`;
  return {
    url: calendarUrl,
    method: "REPORT",
    headers: {
      Authorization: auth,
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
  };
}

export function putCall(url: string, ics: string, auth: string, etag = ""): HttpCall {
  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "text/calendar; charset=utf-8",
  };
  if (etag) headers["If-Match"] = etag;
  return { url, method: "PUT", headers, body: ics };
}

export function deleteCall(url: string, auth: string, etag = ""): HttpCall {
  const headers: Record<string, string> = { Authorization: auth };
  if (etag) headers["If-Match"] = etag;
  return { url, method: "DELETE", headers };
}

export function buildIcs(event: { uid: string; title: string; start: string; end: string; notes?: string }, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Repere//Coach//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Paris",
    "X-LIC-LOCATION:Europe/Paris",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(event.uid)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Europe/Paris:${toIcsLocal(event.start)}`,
    `DTEND;TZID=Europe/Paris:${toIcsLocal(event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
  ];
  if (event.notes) lines.push(`DESCRIPTION:${escapeIcs(event.notes)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function toIcsLocal(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) throw new Error("Horaire invalide.");
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}00`;
}

/** Minuit en Europe/Paris, exprimé en UTC pour le filtre CalDAV. */
export function parisDayToUtc(isoDate: string, endOfDay = false): string {
  const local = endOfDay ? `${isoDate}T23:59:00` : `${isoDate}T00:00:00`;
  const utc = zonedToUtc(local, "Europe/Paris");
  return utc.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function parseCalendarList(xml: string): { href: string; name: string }[] {
  const found: { href: string; name: string }[] = [];
  for (const part of xml.split(/<\/[^>]*response>/i)) {
    const href = matchTag(part, "href");
    const name = matchTag(part, "displayname");
    if (href && name) found.push({ href: decodeXml(href), name: decodeXml(name).trim() });
  }
  return found;
}

export function extractHref(xml: string, parentLocal: string): string | null {
  const inner = matchTag(xml, parentLocal);
  if (!inner) return null;
  const href = matchTag(inner, "href");
  return href ? decodeXml(href).trim() : null;
}

export function eventRecurrenceOpen(ics: string): boolean {
  const unfolded = unfold(ics);
  return unfolded.split("BEGIN:VEVENT").slice(1).some((event) => /^RRULE[:;]/m.test(event.split("END:VEVENT")[0] ?? ""));
}

export function listRecurrenceIncomplete(xml: string): boolean {
  return xml.split(/<\/[^>]*response>/i).some((part) => {
    const data = matchTag(part, "calendar-data");
    if (!data) return false;
    const ics = unfold(decodeXml(data.replace(/<!\[CDATA\[|\]\]>/g, "")));
    return eventRecurrenceOpen(ics);
  });
}

export function summaryOf(ics: string): string {
  const unfolded = unfold(ics);
  const event = unfolded.split("BEGIN:VEVENT").pop()?.split("END:VEVENT")[0] ?? "";
  return icsField(event, "SUMMARY");
}

/** Remplace seulement le titre, les horaires et la note. Alarmes, répétition et fuseau restent. */
export function patchIcs(existing: string, event: { title: string; start: string; end: string; notes?: string }): string {
  const lines = unfold(existing).split(/\r?\n/);
  let inEvent = false;
  let sawSummary = false;
  let sawStart = false;
  let sawEnd = false;
  let sawDesc = false;
  const next: string[] = [];
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      next.push(line);
      continue;
    }
    if (line === "END:VEVENT") {
      if (!sawSummary) next.push(`SUMMARY:${escapeIcs(event.title)}`);
      if (!sawStart) next.push(`DTSTART;TZID=Europe/Paris:${toIcsLocal(event.start)}`);
      if (!sawEnd) next.push(`DTEND;TZID=Europe/Paris:${toIcsLocal(event.end)}`);
      if (event.notes && !sawDesc) next.push(`DESCRIPTION:${escapeIcs(event.notes)}`);
      inEvent = false;
      next.push(line);
      continue;
    }
    if (!inEvent) {
      next.push(line);
      continue;
    }
    if (line.startsWith("SUMMARY")) {
      next.push(`SUMMARY:${escapeIcs(event.title)}`);
      sawSummary = true;
      continue;
    }
    if (line.startsWith("DTSTART")) {
      next.push(`DTSTART;TZID=Europe/Paris:${toIcsLocal(event.start)}`);
      sawStart = true;
      continue;
    }
    if (line.startsWith("DTEND")) {
      next.push(`DTEND;TZID=Europe/Paris:${toIcsLocal(event.end)}`);
      sawEnd = true;
      continue;
    }
    if (line.startsWith("DESCRIPTION")) {
      if (event.notes) next.push(`DESCRIPTION:${escapeIcs(event.notes)}`);
      sawDesc = true;
      continue;
    }
    next.push(line);
  }
  return `${next.filter((line) => line !== "").join("\r\n")}\r\n`;
}

export function parseEvents(xml: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const part of xml.split(/<\/[^>]*response>/i)) {
    const data = matchTag(part, "calendar-data");
    if (!data) continue;
    const ics = unfold(decodeXml(data.replace(/<!\[CDATA\[|\]\]>/g, "")));
    const event = ics.split("BEGIN:VEVENT").pop()?.split("END:VEVENT")[0] ?? ics;
    const title = icsField(event, "SUMMARY");
    const uid = icsField(event, "UID");
    if (!title || !uid) continue;
    events.push({
      uid,
      href: decodeXml(matchTag(part, "href") ?? ""),
      etag: decodeXml(matchTag(part, "getetag") ?? "").replace(/^"|"$/g, ""),
      title,
      start: icsWhen(icsFieldRaw(event, "DTSTART")),
      end: icsWhen(icsFieldRaw(event, "DTEND")),
    });
  }
  return events;
}

export function resolveHref(base: string, href: string): string {
  if (/^https?:\/\//i.test(href)) {
    const absolute = new URL(href);
    if (absolute.protocol !== "https:") throw new Error("Adresse de calendrier refusée.");
    return absolute.toString();
  }
  const url = new URL(base);
  if (href.startsWith("/")) return `${url.origin}${href}`;
  return new URL(href, base.endsWith("/") ? base : `${base}/`).toString();
}

function zonedToUtc(isoLocal: string, timeZone: string): Date {
  const match = isoLocal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) throw new Error("Horaire invalide.");
  const utcGuess = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0);
  const offset = timeZoneOffset(timeZone, new Date(utcGuess));
  return new Date(utcGuess - offset * 60000);
}

function timeZoneOffset(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

function icsWhen(raw: string): string {
  const value = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
  if (/Z$/.test(value)) return utcStampToParis(value);
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!match) return value;
  return match[4] ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}` : `${match[1]}-${match[2]}-${match[3]}`;
}

function utcStampToParis(stamp: string): string {
  const match = stamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return stamp;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

function icsField(ics: string, name: string): string {
  const raw = icsFieldRaw(ics, name);
  const index = raw.indexOf(":");
  return index === -1 ? raw : raw.slice(index + 1).trim();
}

function icsFieldRaw(ics: string, name: string): string {
  const line = ics.split(/\r?\n/).find((item) => item.startsWith(name) && (item[name.length] === ":" || item[name.length] === ";"));
  return line?.trim() ?? "";
}

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function matchTag(xml: string, local: string): string | null {
  const match = xml.match(new RegExp(`<[^>]*${local}[^>]*>([\\s\\S]*?)</[^>]*${local}>`, "i"));
  return match ? match[1].trim() : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
