import type { Metadata, Viewport } from "next";
import { withBase } from "@/lib/base-path";
import "./globals.css";

const themeScript = `(function(){try{var t=localStorage.getItem("repere-theme");var dark=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.add(dark?"dark":"light");}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Repère",
  description: "Carnet de musculation, sur votre téléphone.",
  applicationName: "Repère",
  manifest: withBase("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    title: "Repère",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: withBase("/icon-192.png"), sizes: "192x192", type: "image/png" },
      { url: withBase("/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: withBase("/apple-touch-icon.png"), sizes: "180x180" }],
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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
