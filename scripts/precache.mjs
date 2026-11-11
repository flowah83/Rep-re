import { cpSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeBasePath } from "./base-path.mjs";

/** GitHub Pages ne sert pas les fichiers dont le nom commence par un point. */
export function servedAsset(file) {
  const name = file.split("/").pop() || "";
  if (!name || name.startsWith(".")) return false;
  if (name === "sw.js" || name.endsWith(".map")) return false;
  return true;
}

/** Pont·Line est copié dans out/pontline après le précache : Repère ne l’archive pas. */
export function isPontlineAsset(file) {
  return file === "/pontline" || file.startsWith("/pontline/");
}

export function precacheUrls(files, base) {
  const urls = files.filter((file) => servedAsset(file) && !isPontlineAsset(file)).map((file) => `${base}${file}`);
  const index = `${base}/index.html`;
  if (!urls.includes(index)) urls.push(index);
  return urls;
}

function main() {
  const outDir = path.join(process.cwd(), "out");
  const base = normalizeBasePath(process.env.BASE_PATH);
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "pontline" && dir === outDir) continue;
        walk(full);
        continue;
      }
      files.push("/" + path.relative(outDir, full).split(path.sep).join("/"));
    }
  }
  walk(outDir);
  const urls = precacheUrls(files, base);
  assertPrecache(urls, outDir, base);

  const swPath = path.join(outDir, "sw.js");
  const sw = readFileSync(swPath, "utf8");
  const withList = sw.replace("/*__PRECACHE__*/ []", `/*__PRECACHE__*/ ${JSON.stringify(urls)}`);
  const withBase = withList.replace("/*__BASE__*/ \"\"", `/*__BASE__*/ ${JSON.stringify(base)}`);
  const buildId = `repere-2-${hash(urls.join("\n"))}${base ? `-${base.replace(/\W+/g, "")}` : ""}`;
  const withCache = withBase.replace("/*__CACHE__*/ \"repere-dev-2\"", `/*__CACHE__*/ ${JSON.stringify(buildId)}`);
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

  prefixCss(outDir, base, outDir);
  prefixHtml(outDir, base, outDir);
  copyPontline(outDir);
  console.log(`Précache : ${urls.length} fichiers. Base : ${root}`);
}

function copyPontline(outDir) {
  const source = path.join(process.cwd(), "pontline");
  if (!statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
    console.error("Pont·Line : le dossier pontline/ est introuvable.");
    process.exit(1);
  }
  cpSync(source, path.join(outDir, "pontline"), { recursive: true });
}

function assertPrecache(list, dir, prefix) {
  for (const url of list) {
    const rel = url.startsWith(prefix) ? url.slice(prefix.length) : url;
    const name = rel.split("/").pop() || "";
    if (!name || name.startsWith(".")) {
      console.error(`Précache : GitHub Pages ne sert pas ${url}.`);
      process.exit(1);
    }
    const disk = path.join(dir, rel.replace(/^\//, ""));
    if (!statSync(disk, { throwIfNoEntry: false })?.isFile()) {
      console.error(`Précache : ${url} n’est pas dans out/.`);
      process.exit(1);
    }
  }
}

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

function prefixHtml(dir, prefix, outDir) {
  if (!prefix) return;
  const files = ["manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable.png", "favicon.ico", "og.png"];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "pontline" && dir === outDir) continue;
      prefixHtml(full, prefix, outDir);
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

function prefixCss(dir, prefix, outDir) {
  if (!prefix) return;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "pontline" && dir === outDir) continue;
      prefixCss(full, prefix, outDir);
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

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) main();
