import { config } from "dotenv";
import path from "node:path";

// apps/worker no es Next.js — no hay carga automática de .env. El .env real
// vive en la raíz del monorepo (mismo patrón que apps/web-admin/lib/prisma.ts).
config({ path: path.resolve(process.cwd(), "../../.env") });

import { PrismaClient } from "@gym-app/db/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BcvApiAdapter } from "@gym-app/infrastructure/exchange-rate/BcvApiAdapter";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { actualizarTasaDiaria } from "@gym-app/domain/use-cases/ActualizarTasaDiaria";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const resultado = await actualizarTasaDiaria({
      servicioTasa: new BcvApiAdapter(),
      tasas: new PrismaTasaCambioRepository(prisma),
    });

    if (resultado.fuenteReal === "BCV") {
      console.log(
        `✅ Tasa BCV actualizada: ${resultado.tasa.valor} VES/USD (${resultado.tasa.fecha.toISOString()})`
      );
    } else {
      console.warn(
        `⚠️  La API del BCV falló. Se mantiene la última tasa guardada: ${resultado.tasa.valor} VES/USD (${resultado.tasa.fecha.toISOString()})`
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
