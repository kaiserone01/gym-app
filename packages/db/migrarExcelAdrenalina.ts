// packages/db/migrarExcelAdrenalina.ts
// Migra DATA_ADRENALINA_.xlsm hacia una Organizacion de prueba aislada y
// desechable (slug fijo "migracion-adrenalina-test"), nunca la organización
// real. Ver docs/superpowers/specs/2026-09-28-migracion-excel-adrenalina-design.md
//
// Uso (dry-run, no escribe nada):
//   npm run db:migrar-excel-adrenalina --workspace packages/db
// Uso (escribe en la base):
//   npm run db:migrar-excel-adrenalina:confirm --workspace packages/db
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as configDotenv } from "dotenv";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { leerFilasExcel } from "./migracion-excel/leerExcel";
import { normalizarFila } from "./migracion-excel/normalizarFila";
import { clasificarFila } from "./migracion-excel/clasificarFila";
import { cargarOCrearConfig, generarTemplateMapeoPlan, generarTemplateReglasCedula } from "./migracion-excel/config";
import type { FilaClasificada } from "./migracion-excel/tipos";

configDotenv({ path: path.resolve(__dirname, "../../.env") });

const RUTA_EXCEL = path.resolve(__dirname, "../../docs/xls/DATA ADRENALINA_.xlsm");
const RUTA_MAPEO_PLAN = path.resolve(__dirname, "migracion-excel/mapeo-plan.json");
const RUTA_REGLAS_CEDULA = path.resolve(__dirname, "migracion-excel/reglas-cedula.json");

const SLUG_ORGANIZACION_PRUEBA = "migracion-adrenalina-test";
const NOMBRE_ORGANIZACION_PRUEBA = "Migración Adrenalina (prueba)";
const NOMBRE_SUCURSAL_PRUEBA = "Sucursal Principal";

// Fecha placeholder para F/VENC inválido/vacío — fija y fácilmente
// identificable como pendiente de revisión (sección 6 y 8.3 del diseño).
function obtenerFechaPlaceholder(): Date {
  return new Date("2026-10-05T00:00:00.000Z");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function ofuscarUrl(url: string | undefined): string {
  if (!url) return "(sin DATABASE_URL)";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(url no parseable)";
  }
}

async function obtenerOCrearOrganizacionPrueba() {
  const existente = await prisma.organizacion.findUnique({ where: { slug: SLUG_ORGANIZACION_PRUEBA } });
  if (existente) return existente;
  return prisma.organizacion.create({
    data: { nombre: NOMBRE_ORGANIZACION_PRUEBA, slug: SLUG_ORGANIZACION_PRUEBA, plan: "basico" },
  });
}

async function obtenerOCrearSucursalPrueba(organizacionId: string) {
  const existente = await prisma.sucursal.findFirst({ where: { organizacionId, nombre: NOMBRE_SUCURSAL_PRUEBA } });
  if (existente) return existente;
  return prisma.sucursal.create({
    data: { organizacionId, nombre: NOMBRE_SUCURSAL_PRUEBA, activo: true },
  });
}

async function obtenerOCrearPlanParaFila(
  organizacionId: string,
  nombre: string,
  precioUSD: number,
  activo: boolean,
) {
  const existente = await prisma.plan.findFirst({ where: { organizacionId, nombre } });
  if (existente) return existente;
  return prisma.plan.create({
    data: {
      organizacionId,
      nombre,
      frecuencia: "MENSUAL",
      diasCiclo: 30,
      precioUSD,
      activo,
    },
  });
}

interface UsuarioAdminMinimo {
  id: string;
}

async function obtenerOCrearAdminPrueba(organizacionId: string): Promise<UsuarioAdminMinimo> {
  const existente = await prisma.usuarioAdmin.findFirst({ where: { organizacionId } });
  if (existente) return existente;
  return prisma.usuarioAdmin.create({
    data: {
      organizacionId,
      nombre: "Admin Migración",
      rol: "SOCIO",
      email: `admin-${SLUG_ORGANIZACION_PRUEBA}@migracion.local`,
      passwordHash: "no-usar-para-login",
    },
  });
}

async function migrarFilaConfirmada(
  fila: Extract<FilaClasificada, { categoria: "migrada" }>,
  organizacionId: string,
  sucursalId: string,
  adminId: string,
): Promise<{ escrita: boolean }> {
  const existente = await prisma.miembro.findUnique({
    where: { organizacionId_cedula: { organizacionId, cedula: fila.datos.cedula } },
  });
  if (existente) return { escrita: false };

  const plan = await obtenerOCrearPlanParaFila(
    organizacionId,
    fila.datos.planNombre,
    fila.datos.precioPlanUSD,
    !fila.datos.planLegacy,
  );

  await prisma.$transaction(async (tx) => {
    const miembro = await tx.miembro.create({
      data: {
        organizacionId,
        sucursalId,
        nombre: fila.datos.nombre,
        cedula: fila.datos.cedula,
        celular: fila.datos.celular,
        planId: plan.id,
        precioPlan: fila.datos.precioPlanUSD,
        fechaUltimoPago: fila.datos.pago ? fila.datos.pago.fechaPago : null,
        fechaVencimiento: fila.datos.fechaVencimiento,
        activo: true,
      },
    });

    await tx.suscripcion.create({
      data: {
        miembroId: miembro.id,
        planId: plan.id,
        inicio: fila.datos.fechaInicio,
        fin: fila.datos.fechaVencimiento,
        estado: fila.datos.estado,
      },
    });

    if (fila.datos.pago) {
      await tx.pago.create({
        data: {
          miembroId: miembro.id,
          sucursalId,
          registradoPorId: adminId,
          monto: fila.datos.pago.monto,
          metodo: fila.datos.pago.metodo,
          fechaPago: fila.datos.pago.fechaPago,
        },
      });
    }
  });

  return { escrita: true };
}

async function main() {
  const confirmar = process.argv.includes("--confirm");

  console.log(`Base de datos destino: ${ofuscarUrl(process.env.DATABASE_URL)}`);
  console.log(`Modo: ${confirmar ? "CONFIRM (va a escribir)" : "DRY-RUN (no escribe nada)"}`);

  const filasCrudas = leerFilasExcel(RUTA_EXCEL);
  console.log(`Filas leídas del Excel: ${filasCrudas.length}`);

  const filasNormalizadas = filasCrudas.map(normalizarFila);

  const mapeoPlan = cargarOCrearConfig(RUTA_MAPEO_PLAN, () => generarTemplateMapeoPlan(filasNormalizadas));
  const reglasCedula = cargarOCrearConfig(RUTA_REGLAS_CEDULA, () => generarTemplateReglasCedula(filasNormalizadas));

  const resultados = filasNormalizadas.map((fila) =>
    clasificarFila(fila, mapeoPlan, reglasCedula, obtenerFechaPlaceholder),
  );

  const conteos: Record<string, number> = {};
  for (const r of resultados) {
    const clave =
      r.categoria === "migrada"
        ? r.flags.length === 0
          ? "migrada-limpia"
          : `migrada-con-flag(${r.flags.join(",")})`
        : r.categoria === "excluida"
          ? `excluida(${r.motivo})`
          : "ya-existia";
    conteos[clave] = (conteos[clave] ?? 0) + 1;
  }

  console.log("Resumen de clasificación:");
  for (const [clave, cantidad] of Object.entries(conteos)) {
    console.log(`  ${clave}: ${cantidad}`);
  }

  const reporteInicial = { timestamp: new Date().toISOString(), modo: confirmar ? "confirm" : "dry-run", resultados };
  const rutaReporte = path.resolve(__dirname, `migracion-excel/reporte-migracion-${Date.now()}.json`);
  writeFileSync(rutaReporte, JSON.stringify(reporteInicial, null, 2), "utf-8");
  console.log(`Reporte escrito en: ${rutaReporte}`);

  if (!confirmar) {
    console.log("Dry-run completo. Corré con --confirm para escribir en la base.");
    return;
  }

  const organizacion = await obtenerOCrearOrganizacionPrueba();
  const sucursal = await obtenerOCrearSucursalPrueba(organizacion.id);
  const admin = await obtenerOCrearAdminPrueba(organizacion.id);

  let escritas = 0;
  let saltadas = 0;

  for (const resultado of resultados) {
    if (resultado.categoria !== "migrada") continue;
    try {
      const { escrita } = await migrarFilaConfirmada(resultado, organizacion.id, sucursal.id, admin.id);
      if (escrita) escritas++;
      else saltadas++;
    } catch (error) {
      console.error(`Fila ${resultado.numeroFila} falló al escribir:`, error);
    }
  }

  console.log(`Filas escritas: ${escritas}`);
  console.log(`Filas ya existentes (salteadas): ${saltadas}`);

  writeFileSync(
    rutaReporte,
    JSON.stringify({ ...reporteInicial, filasEscritas: escritas, filasSalteadas: saltadas }, null, 2),
    "utf-8",
  );
}

main()
  .catch((error) => {
    console.error("Error en la migración:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
