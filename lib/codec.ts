function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlToBytes(token: string): Uint8Array {
  const pad = token.length % 4 === 0 ? "" : "=".repeat(4 - (token.length % 4));
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  return Uint8Array.from(bin, (char) => char.charCodeAt(0));
}

export function encodeText(json: string): string {
  return bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeText(token: string): string {
  return new TextDecoder().decode(base64UrlToBytes(token));
}

/** `gz.` + base64url du flux gzip (CompressionStream). Le dièse n’est pas envoyé au serveur. */
export async function encodeGzip(json: string): Promise<string> {
  const input = new TextEncoder().encode(json);
  const stream = new CompressionStream("gzip");
  const done = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(copyBytes(input));
  await writer.close();
  return `gz.${bytesToBase64Url(new Uint8Array(await done))}`;
}

const MAX_IMPORT_CHARS = 2_000_000;
const MAX_IMPORT_TEXT = 4_000_000;

export async function decodeImportToken(token: string): Promise<string | null> {
  try {
    if (token.length > MAX_IMPORT_CHARS) return null;
    const gzip = token.startsWith("gz.");
    const body = gzip ? token.slice(3) : token;
    if (!body) return null;
    const bytes = base64UrlToBytes(body);
    if (bytes.byteLength > MAX_IMPORT_CHARS) return null;
    if (!gzip) {
      const text = new TextDecoder().decode(bytes);
      return text.length > MAX_IMPORT_TEXT ? null : text;
    }
    const stream = new DecompressionStream("gzip");
    const done = new Response(stream.readable).text();
    const writer = stream.writable.getWriter();
    await writer.write(copyBytes(bytes));
    await writer.close();
    const text = await done;
    return text.length > MAX_IMPORT_TEXT ? null : text;
  } catch {
    return null;
  }
}
