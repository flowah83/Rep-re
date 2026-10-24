"use client";

import { useEffect, useState } from "react";
import { loadWeather, readWeather, weatherCondition, weatherVariantFromSearch, type WeatherSnapshot, type WeatherVariant } from "@/lib/weather";

export function WeatherChip() {
  const [snap, setSnap] = useState<WeatherSnapshot | null>(null);
  const [stale, setStale] = useState(false);
  const [variant, setVariant] = useState<WeatherVariant>("tile");

  useEffect(() => {
    setVariant(weatherVariantFromSearch(window.location.search));
    let cancel = false;
    const store = browserStore();
    const cached = readWeather(store);
    if (cached) {
      setSnap(cached);
      setStale(!fresh(cached));
    }
    const pull = () => {
      void loadWeather({ store, now: Date.now(), online: navigator.onLine }).then((result) => {
        if (cancel) return;
        setSnap(result.snapshot);
        setStale(result.stale);
      });
    };
    pull();
    window.addEventListener("online", pull);
    return () => {
      cancel = true;
      window.removeEventListener("online", pull);
    };
  }, []);

  const label = snap ? weatherLabel(snap, stale) : undefined;
  const sky = snap && variant === "widget" ? ` sky-${iconKind(snap.code)}` : "";
  return (
    <div className={`meteo meteo-${variant}${snap ? "" : " is-empty"}${sky}`} data-testid="weather-toulon" data-variant={variant} aria-label={label} role={snap ? "img" : undefined}>
      {snap ? <WeatherFace snap={snap} stale={stale} variant={variant} /> : null}
    </div>
  );
}

function WeatherFace({ snap, stale, variant }: { snap: WeatherSnapshot; stale: boolean; variant: WeatherVariant }) {
  const condition = weatherCondition(snap.code);
  const hasRange = snap.min != null && snap.max != null;
  if (variant === "line") {
    return (
      <>
        <WeatherIcon code={snap.code} />
        <b className="num">{snap.temp}°</b>
        <span>Toulon</span>
        <span>{condition}</span>
        {stale ? <span className="num">{clock(snap.at)}</span> : hasRange ? <span className="num range">{snap.min}° / {snap.max}°</span> : null}
      </>
    );
  }
  if (variant === "widget") {
    return (
      <>
        <WeatherIcon code={snap.code} />
        <div>
          <b className="num">{snap.temp}°</b>
          <small>Toulon</small>
        </div>
        <em className="num">
          {stale ? clock(snap.at) : hasRange ? (
            <>
              <span>min {snap.min}°</span>
              <span>max {snap.max}°</span>
            </>
          ) : condition}
        </em>
      </>
    );
  }
  return (
    <>
      <WeatherIcon code={snap.code} />
      <div>
        <b className="num">{snap.temp}°</b>
        <p>Toulon · {condition}</p>
        {stale ? <p className="num range">{clock(snap.at)}</p> : hasRange ? <p className="num range">min {snap.min}° · max {snap.max}°</p> : null}
      </div>
    </>
  );
}

function fresh(snap: WeatherSnapshot): boolean {
  return Date.now() - snap.at < 30 * 60 * 1000;
}

function clock(at: number): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "numeric", minute: "2-digit", timeZone: "Europe/Paris" }).format(new Date(at));
}

function weatherLabel(snap: WeatherSnapshot, stale: boolean): string {
  const range = snap.min != null && snap.max != null ? `, minimum ${snap.min}, maximum ${snap.max}` : "";
  const when = stale ? `, relevé à ${clock(snap.at)}` : "";
  return `Toulon, ${snap.temp} degrés${range}${when}.`;
}

function browserStore() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function WeatherIcon({ code }: { code: number }) {
  const kind = iconKind(code);
  return (
    <svg className="weather-icon" viewBox="0 0 24 24" aria-hidden="true">
      {kind === "sun" ? <Sun /> : null}
      {kind === "cloud" ? <Cloud /> : null}
      {kind === "rain" ? <Rain /> : null}
      {kind === "snow" ? <Snow /> : null}
      {kind === "storm" ? <Storm /> : null}
      {kind === "fog" ? <Fog /> : null}
    </svg>
  );
}

function iconKind(code: number): "sun" | "cloud" | "rain" | "snow" | "storm" | "fog" {
  if (code === 0 || code === 1) return "sun";
  if (code === 2 || code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 95) return "storm";
  return "rain";
}

function Sun() {
  return (
    <>
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}

function Cloud() {
  return <path d="M8 16.5h8.2a3.3 3.3 0 0 0 .5-6.6 4.2 4.2 0 0 0-8-1 3 3 0 0 0-.7 7.6Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />;
}

function Rain() {
  return (
    <>
      <path d="M8 13.5h8.2a3.3 3.3 0 0 0 .5-6.6 4.2 4.2 0 0 0-8-1 3 3 0 0 0-.7 7.6Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 16.5 8 19M12 16.5 11 19M15 16.5 14 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}

function Snow() {
  return (
    <>
      <path d="M8 13h8.2a3.3 3.3 0 0 0 .5-6.6 4.2 4.2 0 0 0-8-1 3 3 0 0 0-.7 7.6Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 17v2.5M12 17v2.5M15 17v2.5M8 18.2h2M11 18.2h2M14 18.2h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  );
}

function Storm() {
  return (
    <>
      <path d="M8 13h8.2a3.3 3.3 0 0 0 .5-6.6 4.2 4.2 0 0 0-8-1 3 3 0 0 0-.7 7.6Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 14.5 10.5 19h2.2L11 22.5 15.5 17h-2.2L13 14.5Z" fill="currentColor" />
    </>
  );
}

function Fog() {
  return <path d="M5 9h14M4 12h16M6 15h12M7 18h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />;
}
