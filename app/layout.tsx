import type { Metadata, Viewport } from "next";
import { withBase } from "@/lib/base-path";
import "./globals.css";

const themeScript = `(function(){try{var t=localStorage.getItem("repere-theme");var dark=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.add(dark?"dark":"light");}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL("https://flowah83.github.io"),
  title: "Repère",
  description: "Retrouvez vos charges. Notez votre séance. Voyez ce qui progresse.",
  applicationName: "Repère",
  manifest: withBase("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    title: "Repère",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: withBase("/favicon.ico"), sizes: "32x32" },
      { url: withBase("/icon-192.png"), sizes: "192x192", type: "image/png" },
      { url: withBase("/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: withBase("/apple-touch-icon.png"), sizes: "180x180" }],
  },
  openGraph: {
    title: "Repère",
    description: "Retrouvez vos charges. Notez votre séance. Voyez ce qui progresse.",
    images: [{ url: withBase("/og.png"), width: 1200, height: 630 }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EFEAE2" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0F12" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https:; worker-src 'self' blob:"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
