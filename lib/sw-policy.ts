/** Ne retire que les anciens caches de Repère. Un autre site sur la même origine garde les siens. */
export function cachesToDelete(keys: string[], current: string): string[] {
  return keys.filter((key) => key.startsWith("repere-") && key !== current);
}

export function shouldStoreResponse(response: { ok: boolean; status: number }): boolean {
  return response.ok === true && response.status >= 200 && response.status < 300;
}

export function isOptionalPrecache(url: string): boolean {
  return url.endsWith(".glb") || url.includes("/models/");
}
