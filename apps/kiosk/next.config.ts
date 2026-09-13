import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apps/kiosk no tiene backend propio (ADR: "cero lógica de negocio") —
  // todo se sirve como HTML/JS/CSS estático y habla por HTTP con
  // apps/web-admin (ver lib/api.ts).
  output: "export",
};

export default nextConfig;
