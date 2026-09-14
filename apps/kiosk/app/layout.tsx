import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegistrarServiceWorker } from "./RegistrarServiceWorker";
import { ThemeStyleTag } from "@gym-app/theming/ThemeStyleTag";
import { temaAdrenalinaXtreme } from "@gym-app/theming/tokens";

export const metadata: Metadata = {
  title: "Check-in",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: temaAdrenalinaXtreme.ground,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full" style={{ background: "var(--gx-ground)", color: "var(--gx-ink)" }}>
        <ThemeStyleTag tema={temaAdrenalinaXtreme} />
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
