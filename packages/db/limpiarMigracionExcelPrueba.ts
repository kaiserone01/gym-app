// Borra COMPLETA la Organizacion de prueba desechable creada por
// migrarExcelAdrenalina.ts (slug "migracion-adrenalina-test") — miembros,
// pagos, suscripciones, planes, sucursales, usuarios admin y la propia
// organización. Nunca toca la organización real de Adrenalina.
//
// Uso: npm run db:limpiar-migracion-excel-prueba --workspace packages/db
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SLUG_ORGANIZACION_PRUEBA = "migracion-adrenalina-test";

async function main() {
  const organizacion = await prisma.organizacion.findUnique({ where: { slug: SLUG_ORGANIZACION_PRUEBA } });
  if (!organizacion) {
    console.log(`No existe ninguna Organizacion con slug "${SLUG_ORGANIZACION_PRUEBA}" — nada que borrar.`);
    return;
  }

  const miembroIds = (await prisma.miembro.findMany({ where: { organizacionId: organizacion.id }, select: { id: true } })).map((m) => m.id);

  // Datos que aparecen si se inició sesión en el panel con el admin de prueba.
  const usuarioIds = (await prisma.usuarioAdmin.findMany({ where: { organizacionId: organizacion.id }, select: { id: true } })).map((u) => u.id);
  const turnoIds = (await prisma.turno.findMany({ where: { organizacionId: organizacion.id }, select: { id: true } })).map((t) => t.id);
  await prisma.pago.deleteMany({ where: { turnoId: { in: turnoIds } } });
  await prisma.egreso.deleteMany({ where: { turnoId: { in: turnoIds } } });
  await prisma.arqueoLinea.deleteMany({ where: { turnoId: { in: turnoIds } } });
  await prisma.turno.deleteMany({ where: { id: { in: turnoIds } } });
  await prisma.registroAuditoria.deleteMany({ where: { usuarioId: { in: usuarioIds } } });
  await prisma.sesion.deleteMany({ where: { usuarioId: { in: usuarioIds } } });
  await prisma.permisoUsuario.deleteMany({ where: { usuarioId: { in: usuarioIds } } });
  await prisma.usuarioSucursal.deleteMany({ where: { usuarioId: { in: usuarioIds } } });

  const checkIns = await prisma.checkIn.deleteMany({ where: { miembroId: { in: miembroIds } } });
  console.log(`🗑️  CheckIns borrados: ${checkIns.count}`);

  const auditorias = await prisma.cambioPlanAuditoria.deleteMany({ where: { organizacionId: organizacion.id } });
  console.log(`🗑️  Auditorías de cambio de plan borradas: ${auditorias.count}`);

  const pagos = await prisma.pago.deleteMany({ where: { miembroId: { in: miembroIds } } });
  console.log(`🗑️  Pagos borrados: ${pagos.count}`);

  const suscripciones = await prisma.suscripcion.deleteMany({ where: { miembroId: { in: miembroIds } } });
  console.log(`🗑️  Suscripciones borradas: ${suscripciones.count}`);

  const miembros = await prisma.miembro.deleteMany({ where: { organizacionId: organizacion.id } });
  console.log(`🗑️  Miembros borrados: ${miembros.count}`);

  const planes = await prisma.plan.deleteMany({ where: { organizacionId: organizacion.id } });
  console.log(`🗑️  Planes borrados: ${planes.count}`);

  const usuariosAdmin = await prisma.usuarioAdmin.deleteMany({ where: { organizacionId: organizacion.id } });
  console.log(`🗑️  Usuarios admin borrados: ${usuariosAdmin.count}`);

  const sucursales = await prisma.sucursal.deleteMany({ where: { organizacionId: organizacion.id } });
  console.log(`🗑️  Sucursales borradas: ${sucursales.count}`);

  await prisma.organizacion.delete({ where: { id: organizacion.id } });
  console.log(`✅ Organizacion de prueba "${SLUG_ORGANIZACION_PRUEBA}" borrada por completo.`);
}

main()
  .catch((error) => {
    console.error("❌ Error al limpiar la organización de prueba:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
