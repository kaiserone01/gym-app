// Puebla TasaCambio con el histórico completo que expone dolarapi.com
// (fuente BCV), sin la ventana de reconciliación que aplica sincronizarTasas
// (esa ventana es correcta para el cron normal, pero acá queremos sembrar
// TODO el histórico disponible una sola vez).
//
// Uso: desde apps/web-admin, `npx tsx scripts/poblar-historico-tasa-bcv.ts`
import { prisma } from "../lib/prisma";
import { BcvApiAdapter } from "@gym-app/infrastructure/exchange-rate/BcvApiAdapter";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";

async function main() {
  const servicio = new BcvApiAdapter();
  const repositorio = new PrismaTasaCambioRepository(prisma);

  const resultado = await servicio.obtenerPublicadas(null);

  if (resultado.tipo === "SIN_CAMBIOS") {
    console.log("La API no devolvió tasas (304 sin ETag previo, inesperado).");
    return;
  }

  const filtradas = resultado.tasas.filter(
    (t) => Number.isFinite(t.valor) && t.valor > 0
  );

  console.log(`Histórico recibido: ${resultado.tasas.length} filas, ${filtradas.length} válidas.`);

  // guardarVarias() hace todo en una sola transacción — pensada para los
  // pocos registros que trae una sincronización normal, no para sembrar
  // ~900 filas de una vez (el timeout por defecto de la transacción
  // interactiva de Prisma expira antes de terminar). Para este poblado
  // puntual se guarda fila por fila, fuera de transacción.
  let guardadas = 0;
  for (const t of filtradas) {
    await repositorio.guardar(t.fecha, t.valor, "BCV");
    guardadas++;
  }

  console.log(`Guardadas/actualizadas: ${guardadas} filas de fuente BCV.`);
}

main()
  .catch((error) => {
    console.error("Error poblando histórico de tasa BCV:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
