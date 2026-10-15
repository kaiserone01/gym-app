import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La vitrina se empaqueta dentro del APK (apps/vitrina-tv): HTML/JS/CSS estático, sin backend. Habla con
  // web-admin por HTTP (lib/api.ts). Importa solo funciones puras de @gym-app/domain (ADR-002).
  output: "export",
  images: { unoptimized: true },
  transpilePackages: ["@gym-app/domain", "@gym-app/theming"],
};

export default nextConfig;
