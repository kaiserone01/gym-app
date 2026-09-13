// lib/prisma.ts
// Cliente único de Prisma, reutilizado en toda la app (evita múltiples conexiones en desarrollo)

import { config } from "dotenv";
import path from "node:path";
import { PrismaClient } from "@gym-app/db/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Next.js solo carga .env desde su propia carpeta (apps/web-admin); el .env
// real vive en la raíz del monorepo. dotenv no sobreescribe variables ya
// definidas (p.ej. inyectadas por la plataforma en producción), así que esto
// es un no-op seguro fuera de desarrollo local.
config({ path: path.resolve(process.cwd(), "../../.env") });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}