import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeStyleTag } from "@gym-app/theming/ThemeStyleTag";
import { temaAdrenalinaXtreme } from "@gym-app/theming/tokens";

export const metadata: Metadata = {
  title: "Adrenalina Xtreme Gym",
  description: "Panel de administración",
};

export const viewport: Viewport = {
  themeColor: temaAdrenalinaXtreme.ground,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
      <body className="min-h-full flex flex-col">
        <ThemeStyleTag tema={temaAdrenalinaXtreme} />
        {children}
      </body>
    </html>
  );
}
