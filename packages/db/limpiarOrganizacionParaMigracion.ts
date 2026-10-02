// Prepara una organización REAL para la migración definitiva del Excel: borra sus miembros con todo su
// historial y toda la operación de caja. CONSERVA planes, productos, métodos de pago, usuarios y sucursales.
//
// Borra (alcance "B"): check-ins, auditorías de cambio de plan, deudas de productos, TODOS los pagos de la
// organización (de miembros, de productos y de turnos), egresos, arqueos, turnos, suscripciones y miembros.
// IRREVERSIBLE — hacer backup antes. Dry-run por defecto (solo cuenta); --confirm borra.
//
// Uso:
//   npm run db:limpiar-organizacion --workspace packages/db -- --org=<slug>            (dry-run)
//   npm run db:limpiar-organizacion --workspace packages/db -- --org=<slug> --confirm  (borra)
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const slug = process.argv.find((a) => a.startsWith("--org="))?.slice("--org=".length);
  const confirmar = process.argv.includes("--confirm");
  if (!slug) throw new Error("Falta --org=<slug> de la organización a limpiar.");

  const organizacion = await prisma.organizacion.findUnique({ where: { slug } });
  if (!organizacion) throw new Error(`No existe ninguna organización con slug "${slug}".`);

  const orgId = organizacion.id;
  const miembroIds = (await prisma.miembro.findMany({ where: { organizacionId: orgId }, select: { id: true } })).map((m) => m.id);
  const porMiembro = { miembroId: { in: miembroIds } };
  const delTurno = { turno: { organizacionId: orgId } };
  const dePagos = { sucursal: { organizacionId: orgId } };

  const conteos = {
    checkIns: await prisma.checkIn.count({ where: porMiembro }),
    auditoriasCambioPlan: await prisma.cambioPlanAuditoria.count({ where: { organizacionId: orgId } }),
    deudasProducto: await prisma.deudaProducto.count({ where: { organizacionId: orgId } }),
    pagos: await prisma.pago.count({ where: { OR: [porMiembro, dePagos] } }),
    egresos: await prisma.egreso.count({ where: delTurno }),
    arqueos: await prisma.arqueoLinea.count({ where: delTurno }),
    turnos: await prisma.turno.count({ where: { organizacionId: orgId } }),
    suscripciones: await prisma.suscripcion.count({ where: porMiembro }),
    miembros: miembroIds.length,
  };

  console.log(`Organización: ${organizacion.nombre} (${slug}) — base ${new URL(process.env.DATABASE_URL ?? "postgres://x").hostname}`);
  console.log(`Modo: ${confirmar ? "CONFIRM (BORRA)" : "DRY-RUN (no borra nada)"}`);
  console.log("Se borrarían:", conteos);
  console.log(
    "Se conservan:",
    JSON.stringify({
      planes: await prisma.plan.count({ where: { organizacionId: orgId } }),
      productos: await prisma.producto.count({ where: { organizacionId: orgId } }),
      metodosPago: await prisma.metodoPago.count({ where: { organizacionId: orgId } }),
      usuarios: await prisma.usuarioAdmin.count({ where: { organizacionId: orgId } }),
      sucursales: await prisma.sucursal.count({ where: { organizacionId: orgId } }),
    }),
  );
  if (!confirmar) {
    console.log("Dry-run completo. Corré con --confirm para borrar.");
    return;
  }

  // Una sola transacción: o se borra todo o no se borra nada.
  await prisma.$transaction(
    async (tx) => {
      await tx.checkIn.deleteMany({ where: porMiembro });
      await tx.cambioPlanAuditoria.deleteMany({ where: { organizacionId: orgId } });
      await tx.deudaProducto.deleteMany({ where: { organizacionId: orgId } });
      await tx.pago.deleteMany({ where: { OR: [porMiembro, dePagos] } });
      await tx.egreso.deleteMany({ where: delTurno });
      await tx.arqueoLinea.deleteMany({ where: delTurno });
      await tx.turno.deleteMany({ where: { organizacionId: orgId } });
      await tx.suscripcion.deleteMany({ where: porMiembro });
      await tx.miembro.deleteMany({ where: { organizacionId: orgId } });
    },
    { timeout: 120000 },
  );

  console.log(`✅ Organización "${slug}" limpia: ${conteos.miembros} miembros y su historial, y ${conteos.turnos} turnos borrados.`);
}

main()
  .catch((error) => {
    console.error("❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
