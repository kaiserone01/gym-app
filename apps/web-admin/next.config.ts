import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera un server.js autocontenido (apps/web-admin/.next/standalone)
  // con solo las dependencias de producción realmente usadas — necesario
  // para una imagen Docker liviana en un monorepo npm workspaces.
  output: "standalone",
};

export default nextConfig;
