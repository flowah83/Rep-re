import type { NextConfig } from "next";
import { normalizeBasePath } from "./scripts/base-path.mjs";

const basePath = normalizeBasePath(process.env.BASE_PATH);

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath || "/",
  },
};

export default nextConfig;
