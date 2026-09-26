import { config } from "dotenv";
import path from "node:path";

// apps/worker no es Next.js — no hay carga automática de .env. El .env real
// vive en la raíz del monorepo (mismo patrón que apps/web-admin/lib/prisma.ts).
config({ path: path.resolve(process.cwd(), "../../.env") });

import { PrismaClient } from "@gym-app/db/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BcvApiAdapter } from "@gym-app/infrastructure/exchange-rate/BcvApiAdapter";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { sincronizarTasas } from "@gym-app/domain/use-cases/SincronizarTasas";
import { obtenerTasaVigente } from "@gym-app/domain/use-cases/ObtenerTasaVigente";
import { diaCalendarioCaracas } from "@gym-app/domain/utils/fechaCaracas";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const tasas = new PrismaTasaCambioRepository(prisma);
    const hoy = diaCalendarioCaracas(new Date());

    try {
      const resultado = await sincronizarTasas(
        { servicioTasa: new BcvApiAdapter(), tasas },
        { versionConocida: null, hoy }
      );
      const vigente = await obtenerTasaVigente({ tasas }, hoy);
      const fechaValor = vigente.tasa.fecha.toISOString().slice(0, 10);
      console.log(
        `✅ Sincronizado: ${resultado.guardadas} filas. Tasa en curso: ${vigente.tasa.valor} (publicada con fecha valor ${fechaValor})`
      );
    } catch (error) {
      const ultima = await tasas.obtenerUltima().catch(() => null);
      if (!ultima) {
        console.error(`⚠️ DolarAPI falló: ${(error as Error).message}. No hay ninguna tasa guardada.`);
        process.exitCode = 1;
        return;
      }
      const fechaValor = ultima.fecha.toISOString().slice(0, 10);
      console.warn(
        `⚠️ DolarAPI falló: ${(error as Error).message}. Tasa guardada: ${ultima.valor} (publicada con fecha valor ${fechaValor})`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("❌ Error al actualizar la tasa del BCV:", error);
  process.exit(1);
});
