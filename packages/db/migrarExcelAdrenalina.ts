// packages/db/migrarExcelAdrenalina.ts
// Migra DATA_ADRENALINA_.xlsm hacia una Organizacion de prueba aislada y
// desechable (slug fijo "migracion-adrenalina-test"), nunca la organización
// real. Ver docs/superpowers/specs/2026-09-28-migracion-excel-adrenalina-design.md
//
// Uso (dry-run, no escribe nada):
//   npm run db:migrar-excel-adrenalina --workspace packages/db
// Uso (escribe en la base):
//   MIGRACION_ADMIN_PASSWORD=<clave> npm run db:migrar-excel-adrenalina:confirm --workspace packages/db
// (la variable es opcional: habilita el login del admin de prueba para revisar en el panel)
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as configDotenv } from "dotenv";
import bcrypt from "bcryptjs";
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

const MODULOS_PERMISO = ["MIEMBROS", "PAGOS", "PLANES", "CAJA", "USUARIOS", "SUCURSALES"] as const;
const ACCIONES_PERMISO = ["VER", "CREAR", "EDITAR", "ELIMINAR"] as const;

// El admin de prueba es un SOCIO real: con MIGRACION_ADMIN_PASSWORD definida se le
// asigna contraseña, permisos y sucursal para poder entrar al panel y revisar la
// migración (sin la variable queda como usuario sin login, solo para el FK de pagos).
async function obtenerOCrearAdminPrueba(organizacionId: string, sucursalId: string): Promise<UsuarioAdminMinimo> {
  let admin = await prisma.usuarioAdmin.findFirst({ where: { organizacionId } });
  if (!admin) {
    admin = await prisma.usuarioAdmin.create({
      data: {
        organizacionId,
        sucursalId,
        nombre: "Admin Migración",
        rol: "SOCIO",
        email: `admin-${SLUG_ORGANIZACION_PRUEBA}@migracion.local`,
        passwordHash: "no-usar-para-login",
      },
    });
  }
  const password = process.env.MIGRACION_ADMIN_PASSWORD;
  if (password) {
    await prisma.usuarioAdmin.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    await prisma.permisoUsuario.createMany({
      data: MODULOS_PERMISO.flatMap((modulo) => ACCIONES_PERMISO.map((accion) => ({ usuarioId: admin.id, modulo, accion }))),
      skipDuplicates: true,
    });
    await prisma.usuarioSucursal.createMany({ data: [{ usuarioId: admin.id, sucursalId }], skipDuplicates: true });
    console.log(`Login de prueba habilitado: ${admin.email}`);
  }
  return admin;
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
  // Si el Plan ya existía, su precioUSD/activo reales mandan — nunca se sobreescriben
  // con lo computado por esta fila (ver obtenerOCrearPlanParaFila: reuse existing as-is).
  // Excepción: un plan aproximado conserva en el miembro el precio original del Excel.
  const precioPlanParaMiembro = fila.datos.precioPlanOriginalUSD ?? plan.precioUSD;

  await prisma.$transaction(async (tx) => {
    const miembro = await tx.miembro.create({
      data: {
        organizacionId,
        sucursalId,
        nombre: fila.datos.nombre,
        cedula: fila.datos.cedula,
        celular: fila.datos.celular,
        planId: plan.id,
        precioPlan: precioPlanParaMiembro,
        fechaUltimoPago: fila.datos.fechaUltimoPago,
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
  const admin = await obtenerOCrearAdminPrueba(organizacion.id, sucursal.id);

  let escritas = 0;
  let saltadas = 0;
  let conError = 0;
  const resultadosFinales: FilaClasificada[] = [];

  for (const resultado of resultados) {
    if (resultado.categoria !== "migrada") {
      resultadosFinales.push(resultado);
      continue;
    }
    try {
      const { escrita } = await migrarFilaConfirmada(resultado, organizacion.id, sucursal.id, admin.id);
      if (escrita) {
        escritas++;
        resultadosFinales.push(resultado);
      } else {
        saltadas++;
        resultadosFinales.push({
          categoria: "ya-existia",
          numeroFila: resultado.numeroFila,
          cedula: resultado.datos.cedula,
        });
      }
    } catch (error) {
      conError++;
      console.error(`Fila ${resultado.numeroFila} falló al escribir:`, error);
      resultadosFinales.push({
        categoria: "excluida",
        motivo: "error-parseo",
        numeroFila: resultado.numeroFila,
        detalle: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`Filas escritas: ${escritas}`);
  console.log(`Filas ya existentes (salteadas): ${saltadas}`);
  console.log(`Filas con error al escribir: ${conError}`);

  writeFileSync(
    rutaReporte,
    JSON.stringify(
      {
        ...reporteInicial,
        resultados: resultadosFinales,
        filasEscritas: escritas,
        filasSalteadas: saltadas,
        filasConError: conError,
      },
      null,
      2,
    ),
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
