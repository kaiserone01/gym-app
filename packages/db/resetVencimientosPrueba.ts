// Resetea Miembro.fechaVencimiento y Suscripcion.fin (última suscripción de
// cada miembro activo) a un rango realista de prueba: entre -16 y +45 días
// respecto a hoy, con distribución variada (vencidos recientes, por vencer
// pronto, por vencer con margen). Ver contexto en handoff/prompt de Gustavo
// (2026-09-27): los vencimientos actuales son producto de pruebas de pago
// acumuladas, no de uso real.
//
// Modo preview (default, no escribe nada):
//   npx tsx resetVencimientosPrueba.ts
// Modo aplicar (ejecuta el UPDATE en una única transacción):
//   npx tsx resetVencimientosPrueba.ts --aplicar
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APLICAR = process.argv.includes("--aplicar");

// Semilla fija para reproducibilidad/auditoría del reseteo.
const SEMILLA = 20260927;

function mulberry32(semilla: number) {
  let a = semilla;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEMILLA);

const VENCIDOS = [-3, -4, -8, -9, -14, -16];
const VIGENTES_IMPARES = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45];

// ~40% vencidos recientes, 60% vigentes con margen variado (impares).
function elegirDesplazamiento(): number {
  const esVencido = random() < 0.4;
  const lista = esVencido ? VENCIDOS : VIGENTES_IMPARES;
  const indice = Math.floor(random() * lista.length);
  return lista[indice];
}

function sumarDias(fecha: Date, dias: number): Date {
  const nueva = new Date(fecha);
  nueva.setHours(0, 0, 0, 0);
  nueva.setDate(nueva.getDate() + dias);
  return nueva;
}

async function main() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const miembros = await prisma.miembro.findMany({
    where: { activo: true },
    include: {
      suscripciones: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { nombre: "asc" },
  });

  type Fila = {
    id: string;
    nombre: string;
    vencimientoAnteriorMiembro: string;
    finAnteriorSuscripcion: string;
    desplazamientoDias: number;
    vencimientoNuevo: string;
    suscripcionId: string | null;
  };

  const filas: Fila[] = miembros.map((m) => {
    const desplazamiento = elegirDesplazamiento();
    const vencimientoNuevo = sumarDias(hoy, desplazamiento);
    const ultimaSuscripcion = m.suscripciones[0] ?? null;

    return {
      id: m.id,
      nombre: m.nombre,
      vencimientoAnteriorMiembro: m.fechaVencimiento
        ? m.fechaVencimiento.toISOString().slice(0, 10)
        : "—",
      finAnteriorSuscripcion: ultimaSuscripcion
        ? ultimaSuscripcion.fin.toISOString().slice(0, 10)
        : "— (sin suscripción)",
      desplazamientoDias: desplazamiento,
      vencimientoNuevo: vencimientoNuevo.toISOString().slice(0, 10),
      suscripcionId: ultimaSuscripcion?.id ?? null,
    };
  });

  console.log(`\nPropuesta de reseteo para ${filas.length} miembros activos (semilla=${SEMILLA}):\n`);
  console.table(
    filas.map((f) => ({
      nombre: f.nombre,
      vencimientoAnteriorMiembro: f.vencimientoAnteriorMiembro,
      finAnteriorSuscripcion: f.finAnteriorSuscripcion,
      vencimientoNuevo: f.vencimientoNuevo,
      desplazamientoDias: f.desplazamientoDias,
    }))
  );

  const vencidos = filas.filter((f) => f.desplazamientoDias < 0).length;
  const vigentes = filas.filter((f) => f.desplazamientoDias >= 0).length;
  console.log(`Distribución: ${vencidos} vencidos, ${vigentes} vigentes.\n`);

  if (!APLICAR) {
    console.log("Modo preview — no se escribió nada. Ejecutá con --aplicar para confirmar el UPDATE.\n");
    return;
  }

  console.log("Aplicando reseteo dentro de una transacción única...\n");

  const fechaEjecucion = new Date();
  const logEntradas: {
    miembroId: string;
    nombre: string;
    vencimientoAnterior: string;
    vencimientoNuevo: string;
  }[] = [];

  // Timeout default de 5s es insuficiente para ~110 updates en serie.
  await prisma.$transaction(async (tx) => {
    for (const m of miembros) {
      const fila = filas.find((f) => f.id === m.id)!;
      const vencimientoNuevo = sumarDias(hoy, fila.desplazamientoDias);

      await tx.miembro.update({
        where: { id: m.id },
        data: { fechaVencimiento: vencimientoNuevo },
      });

      if (fila.suscripcionId) {
        await tx.suscripcion.update({
          where: { id: fila.suscripcionId },
          data: { fin: vencimientoNuevo },
        });
      }

      logEntradas.push({
        miembroId: m.id,
        nombre: m.nombre,
        vencimientoAnterior: fila.vencimientoAnteriorMiembro,
        vencimientoNuevo: fila.vencimientoNuevo,
      });
    }
  }, { timeout: 30000 });

  const logPath = path.resolve(__dirname, `reset-vencimientos-log-${fechaEjecucion.toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(
    logPath,
    JSON.stringify({ fechaEjecucion: fechaEjecucion.toISOString(), semilla: SEMILLA, entradas: logEntradas }, null, 2)
  );

  console.log(`✅ Reseteo aplicado. Log guardado en: ${logPath}\n`);
}

main()
  .catch((error) => {
    console.error("❌ Error en reseteo (se revirtió la transacción si estaba en curso):", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
