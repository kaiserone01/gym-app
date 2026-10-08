// packages/db/importarPadronExcel.ts
// Importa un Excel de Adrenalina al padrón de referencia (MiembroReferencia). NO crea ni modifica
// Miembro/Plan/Suscripcion/Pago. Dry-run por defecto; --confirm escribe (upsert por org+cédula).
//
//   npm run db:importar-padron --workspace packages/db -- --org=<slug> --sucursal="<nombre>" [--archivo=<ruta>]
//   npm run db:importar-padron:confirm --workspace packages/db -- --org=<slug> --sucursal="<nombre>"
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as configDotenv } from "dotenv";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { leerFilasExcel } from "./migracion-excel/leerExcel";
import { prepararPadron, reconciliarPadron, type ComparablesPadron } from "./migracion-excel/padron";

configDotenv({ path: path.resolve(__dirname, "../../.env") });

const ARCHIVO_POR_DEFECTO = path.resolve(__dirname, "../../docs/xls/DATA ADRENALINA_hoy.xlsm");
const LOTE = 20;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function argumento(nombre: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
}

function ofuscarUrl(url: string | undefined): string {
  if (!url) return "(sin DATABASE_URL)";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(url no parseable)";
  }
}

async function main() {
  const confirmar = process.argv.includes("--confirm");
  const slug = argumento("org");
  const nombreSucursal = argumento("sucursal");
  if (!slug || !nombreSucursal) throw new Error('Hacen falta --org=<slug> y --sucursal="<nombre>".');
  const archivo = path.resolve(argumento("archivo") ?? ARCHIVO_POR_DEFECTO);

  const organizacion = await prisma.organizacion.findUnique({ where: { slug } });
  if (!organizacion) throw new Error(`No existe la organización "${slug}".`);
  const sucursal = await prisma.sucursal.findFirst({ where: { organizacionId: organizacion.id, nombre: nombreSucursal } });
  if (!sucursal) throw new Error(`No existe la sucursal "${nombreSucursal}" en "${slug}".`);

  console.log(`BD: ${ofuscarUrl(process.env.DATABASE_URL)} | org: ${slug} | sede: ${nombreSucursal} | modo: ${confirmar ? "ESCRIBE" : "dry-run"}`);
  console.log(`Archivo: ${archivo}`);

  const { elegibles, excluidas } = prepararPadron(leerFilasExcel(archivo));

  // Antes del primer deploy la tabla aún no existe (P2021): el dry-run sigue, tratándola como vacía.
  let existentes: ComparablesPadron[] = [];
  try {
    existentes = await prisma.miembroReferencia.findMany({ where: { organizacionId: organizacion.id } });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2021") throw error;
    if (confirmar) throw new Error("La tabla MiembroReferencia no existe: despliega primero la migración.");
    console.log("(La tabla MiembroReferencia aún no existe: se compara contra un padrón vacío.)");
  }
  const diff = reconciliarPadron(new Map(existentes.map((e) => [e.cedula, e])), elegibles);

  const resumen = {
    elegibles: elegibles.length,
    altas: diff.altas.length,
    cambios: diff.cambios.length,
    sinCambios: diff.sinCambios,
    conflictos: diff.conflictos.length, // campos editados a mano que el Excel trae distintos (se respeta lo editado)
    excluidas: excluidas.length,
    excluidasPorMotivo: {
      "sin-cedula": excluidas.filter((e) => e.motivo === "sin-cedula").length,
      "cedula-repetida": excluidas.filter((e) => e.motivo === "cedula-repetida").length,
    },
  };
  console.log(resumen);

  const rutaReporte = path.resolve(__dirname, `migracion-excel/reporte-padron-${Date.now()}.json`);
  writeFileSync(rutaReporte, JSON.stringify({ archivo, resumen, altas: diff.altas.map((a) => a.cedula), cambios: diff.cambios, conflictos: diff.conflictos, excluidas }, null, 2));
  console.log(`Reporte: ${rutaReporte}`);

  if (!confirmar) {
    console.log("Dry-run: no se escribió nada. Usa --confirm para cargar el padrón.");
    return;
  }

  // Cada upsert es idempotente: si se interrumpe, basta con volver a correr --confirm. `aEscribir` ya trae
  // las ediciones manuales aplicadas, y camposEditados/editadoAt/editadoPor no se tocan.
  const archivoOrigen = path.basename(archivo);
  for (let i = 0; i < diff.aEscribir.length; i += LOTE) {
    await Promise.all(
      diff.aEscribir.slice(i, i + LOTE).map((d) => {
        const { cedula, ...datos } = d;
        const valores = { ...datos, sucursalId: sucursal.id, archivoOrigen, importadoAt: new Date() };
        return prisma.miembroReferencia.upsert({
          where: { organizacionId_cedula: { organizacionId: organizacion.id, cedula } },
          create: { organizacionId: organizacion.id, cedula, ...valores },
          update: valores,
        });
      })
    );
    console.log(`  ${Math.min(i + LOTE, diff.aEscribir.length)}/${diff.aEscribir.length}`);
  }
  console.log("Padrón cargado.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
