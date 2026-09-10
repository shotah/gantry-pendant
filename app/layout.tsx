import type { Metadata, Viewport } from "next";
import { RegisterSW } from "./components/shared/RegisterSW";
import { DEFAULT_FONT, FONT_BOOT, fontCss } from "./lib/font";
import { DEFAULT_THEME, THEME_BOOT, themeCss, themeOf } from "./lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "pendant",
  description: "Handheld mouth for an ai-gantry crane",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "pendant", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: themeOf(DEFAULT_THEME).tokens.canvas,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} data-font={DEFAULT_FONT} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: `${themeCss()}${fontCss()}` }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: FONT_BOOT }} />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="h-dvh overflow-hidden bg-canvas text-body antialiased">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
