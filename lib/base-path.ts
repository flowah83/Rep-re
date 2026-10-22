/** Préfixe public sans slash final. Vide quand le site est servi à la racine. */
export function publicBase(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH || "/";
  if (!raw || raw === "/") return "";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}

export function withBase(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${publicBase()}${suffix}`;
}
