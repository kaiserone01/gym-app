// Config de Prisma SOLO para una base local desechable. A diferencia de prisma7.config.ts, no carga el
// .env de la raíz (que apunta a producción): lee DATABASE_URL_LOCAL de packages/db/.env.local y aborta si el
// host no es localhost. Toda operación de Prisma de la vitrina usa `--config prisma7.local.config.ts`.
import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

config({ path: path.resolve(__dirname, ".env.local"), quiet: true });

const url = process.env["DATABASE_URL_LOCAL"];
if (!url) throw new Error("Falta DATABASE_URL_LOCAL (packages/db/.env.local). No se usa el .env de producción.");
const host = new URL(url).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  throw new Error(`DATABASE_URL_LOCAL apunta a "${host}": solo se permite localhost o 127.0.0.1.`);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
