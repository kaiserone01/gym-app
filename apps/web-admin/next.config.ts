import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera un server.js autocontenido (apps/web-admin/.next/standalone)
  // con solo las dependencias de producción realmente usadas — necesario
  // para una imagen Docker liviana en un monorepo npm workspaces.
  output: "standalone",
  // @gym-app/domain y @gym-app/infrastructure son paquetes internos sin
  // build propio (solo .ts fuente) — Next.js necesita transpilarlos
  // explícitamente, a diferencia de @gym-app/db (ya es JS compilado por
  // `prisma generate`).
  transpilePackages: ["@gym-app/domain", "@gym-app/infrastructure"],
};

export default nextConfig;
