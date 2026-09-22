import { config } from "dotenv";
import path from "node:path";

// apps/worker no es Next.js — no hay carga automática de .env. El .env real
// vive en la raíz del monorepo (mismo patrón que actualizar-tasa.ts).
config({ path: path.resolve(process.cwd(), "../../.env") });

import cron from "node-cron";
import { PrismaClient } from "@gym-app/db/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BcvApiAdapter } from "@gym-app/infrastructure/exchange-rate/BcvApiAdapter";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { actualizarTasaDiaria } from "@gym-app/domain/use-cases/ActualizarTasaDiaria";

// Proceso long-running (para Easypanel: servicio tipo "Aplicación" sin
// dominio expuesto, solo corriendo en background) que reemplaza al cron
// externo que nunca se llegó a configurar — antes actualizar-tasa.ts
// corría una vez y salía, así que la tasa se quedaba vieja hasta que
// alguien la ejecutara a mano (ver caso real: quedó 11 días desactualizada,
// 832.49 en vez de 852.41). Corre la actualización una vez al arrancar
// (por si el servicio estuvo caído el día que tocaba) y despué una vez
// por día a las 12:00 UTC (8:00am hora Venezuela, después de que el BCV
// suele publicar la tasa del día).
const HORA_CRON = "0 12 * * *";

async function actualizar() {
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
  } catch (error) {
    // No se relanza — un fallo puntual (red, API caída) no debe matar el
    // daemon; se reintenta solo en la siguiente corrida programada.
    console.error("❌ Error al actualizar la tasa del BCV:", error);
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`Worker de tasa BCV iniciado — próxima corrida programada: "${HORA_CRON}" (UTC).`);
actualizar();
cron.schedule(HORA_CRON, actualizar);
