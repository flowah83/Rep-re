import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeBasePath } from "./base-path.mjs";

const outDir = path.join(process.cwd(), "out");
const base = normalizeBasePath(process.env.BASE_PATH);
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else files.push("/" + path.relative(outDir, full).split(path.sep).join("/"));
  }
}

walk(outDir);

const urls = files
  .filter((file) => file !== "/sw.js" && !file.endsWith(".map"))
  .map((file) => `${base}${file}`);
if (!urls.includes(`${base}/index.html`)) urls.push(`${base}/index.html`);

const swPath = path.join(outDir, "sw.js");
let sw = readFileSync(swPath, "utf8");
const withList = sw.replace("/*__PRECACHE__*/ []", `/*__PRECACHE__*/ ${JSON.stringify(urls)}`);
const withBase = withList.replace("/*__BASE__*/ \"\"", `/*__BASE__*/ ${JSON.stringify(base)}`);
const buildId = `repere-${hash(urls.join("\n"))}${base ? `-${base.replace(/\W+/g, "")}` : ""}`;
const withCache = withBase.replace("/*__CACHE__*/ \"repere-dev\"", `/*__CACHE__*/ ${JSON.stringify(buildId)}`);
if (withCache === sw) {
  console.error("Le service worker n’a pas les marqueurs de précache.");
  process.exit(1);
}
writeFileSync(swPath, withCache);

const manifestPath = path.join(outDir, "manifest.webmanifest");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const root = `${base}/`;
manifest.start_url = root;
manifest.scope = root;
manifest.icons = (manifest.icons || []).map((icon) => ({
  ...icon,
  src: prefixPublic(icon.src, base),
}));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

prefixCss(outDir, base);
prefixHtml(outDir, base);
console.log(`Précache : ${urls.length} fichiers. Base : ${root}`);

function hash(value) {
  let n = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    n ^= value.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return (n >>> 0).toString(36);
}

function prefixPublic(src, prefix) {
  if (!prefix || typeof src !== "string" || !src.startsWith("/") || src.startsWith(`${prefix}/`)) return src;
  return `${prefix}${src}`;
}

function prefixHtml(dir, prefix) {
  if (!prefix) return;
  const files = ["manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable.png", "favicon.ico", "og.png"];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      prefixHtml(full, prefix);
      continue;
    }
    if (!entry.endsWith(".html")) continue;
    let html = readFileSync(full, "utf8");
    for (const file of files) {
      html = html.replaceAll(`="${prefix}/${file}"`, `="__KEEP__/${file}"`);
      html = html.replaceAll(`="/${file}"`, `="${prefix}/${file}"`);
      html = html.replaceAll(`="__KEEP__/${file}"`, `="${prefix}/${file}"`);
    }
    writeFileSync(full, html);
  }
}

function prefixCss(dir, prefix) {
  if (!prefix) return;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      prefixCss(full, prefix);
      continue;
    }
    if (!entry.endsWith(".css")) continue;
    const css = readFileSync(full, "utf8");
    const next = css
      .replaceAll('url("/fonts/', `url("${prefix}/fonts/`)
      .replaceAll("url('/fonts/", `url('${prefix}/fonts/`)
      .replaceAll("url(/fonts/", `url(${prefix}/fonts/`);
    if (next !== css) writeFileSync(full, next);
  }
}
