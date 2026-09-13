import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegistrarServiceWorker } from "./RegistrarServiceWorker";

export const metadata: Metadata = {
  title: "Check-in",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
