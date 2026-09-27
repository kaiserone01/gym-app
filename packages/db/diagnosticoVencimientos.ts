// Diagnóstico de solo lectura: lista miembros activos con su fechaVencimiento
// actual, días de diferencia respecto a hoy, y si caen fuera del rango
// deseado (-16 a +45 días). No modifica nada.
//
// Uso: npm run db:diagnostico-vencimientos --workspace packages/db
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const RANGO_MIN = -16;
const RANGO_MAX = 45;

function diasHastaVencimiento(fechaVencimiento: Date): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencimiento = new Date(fechaVencimiento);
  vencimiento.setHours(0, 0, 0, 0);
  return Math.round((vencimiento.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));
}

async function main() {
  const miembros = await prisma.miembro.findMany({
    where: { activo: true },
    include: {
      plan: true,
      suscripciones: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { nombre: "asc" },
  });

  console.log(`Total miembros activos: ${miembros.length}\n`);

  const filas: {
    id: string;
    nombre: string;
    plan: string;
    fechaVencimientoMiembro: string;
    diasMiembro: number | string;
    finSuscripcion: string;
    diasSuscripcion: number | string;
    desincronizado: boolean;
    fueraDeRango: boolean;
  }[] = [];

  for (const m of miembros) {
    const ultimaSuscripcion = m.suscripciones[0];

    const diasMiembro = m.fechaVencimiento ? diasHastaVencimiento(m.fechaVencimiento) : "sin fecha";
    const diasSuscripcion = ultimaSuscripcion ? diasHastaVencimiento(ultimaSuscripcion.fin) : "sin suscripcion";

    const desincronizado =
      !!m.fechaVencimiento &&
      !!ultimaSuscripcion &&
      m.fechaVencimiento.getTime() !== ultimaSuscripcion.fin.getTime();

    const fueraDeRango =
      typeof diasMiembro === "number" && (diasMiembro < RANGO_MIN || diasMiembro > RANGO_MAX);

    filas.push({
      id: m.id,
      nombre: m.nombre,
      plan: m.plan?.nombre ?? "sin plan",
      fechaVencimientoMiembro: m.fechaVencimiento ? m.fechaVencimiento.toISOString().slice(0, 10) : "—",
      diasMiembro,
      finSuscripcion: ultimaSuscripcion ? ultimaSuscripcion.fin.toISOString().slice(0, 10) : "—",
      diasSuscripcion,
      desincronizado,
      fueraDeRango,
    });
  }

  console.table(filas);

  const fueraDeRango = filas.filter((f) => f.fueraDeRango);
  const dentroDeRango = filas.filter((f) => !f.fueraDeRango);
  const desincronizados = filas.filter((f) => f.desincronizado);

  console.log(`\nDentro del rango (-16 a +45 días): ${dentroDeRango.length} — no necesitan tocarse`);
  console.log(`Fuera del rango: ${fueraDeRango.length} — candidatos a resetear`);
  console.log(`Desincronizados (Miembro.fechaVencimiento != Suscripcion.fin): ${desincronizados.length}`);

  if (desincronizados.length > 0) {
    console.log("\n⚠️  Miembros desincronizados:");
    console.table(desincronizados);
  }

  if (fueraDeRango.length > 0) {
    console.log("\n📋 Miembros fuera de rango (candidatos a reseteo):");
    console.table(fueraDeRango);
  }
}

main()
  .catch((error) => {
    console.error("❌ Error en diagnóstico:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
