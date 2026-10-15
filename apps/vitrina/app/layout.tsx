import type { Metadata, Viewport } from "next";
import { Barlow, Bebas_Neue } from "next/font/google";
import "./globals.css";
import { ThemeStyleTag } from "@gym-app/theming/ThemeStyleTag";
import { temaAdrenalinaXtreme } from "@gym-app/theming/tokens";

// next/font descarga y empaqueta las fuentes en el build: la TV las tiene sin internet.
const titulo = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--fuente-titulo" });
const texto = Barlow({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--fuente-texto" });

export const metadata: Metadata = { title: "Vitrina" };
export const viewport: Viewport = { themeColor: temaAdrenalinaXtreme.ground };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`h-full ${titulo.variable} ${texto.variable}`}>
      <body className="h-full overflow-hidden" style={{ background: "var(--gx-ground)", color: "var(--gx-ink)" }}>
        <ThemeStyleTag tema={temaAdrenalinaXtreme} />
        {children}
      </body>
    </html>
  );
}
