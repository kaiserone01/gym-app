import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apps/kiosk no tiene backend propio (ADR: "cero lógica de negocio") —
  // todo se sirve como HTML/JS/CSS estático y habla por HTTP con
  // apps/web-admin (ver lib/api.ts). @gym-app/theming y @gym-app/ui son
  // paquetes de presentación pura (sin Prisma, sin dominio) — agregarlos
  // no viola esa regla.
  output: "export",
  transpilePackages: ["@gym-app/theming", "@gym-app/ui"],
};

export default nextConfig;
