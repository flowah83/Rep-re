/** Préfixe Next (`basePath`) : vide à la racine, sinon sans slash final. */
export function normalizeBasePath(value) {
  if (value == null) return "";
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "/") return "";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}
