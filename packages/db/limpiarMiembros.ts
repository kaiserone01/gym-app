// Borra TODOS los miembros y lo que cuelga de ellos (check-ins, pagos,
// suscripciones), para arrancar de cero en pruebas. No toca Plan,
// Sucursal, Organizacion ni UsuarioAdmin — esos catálogos quedan intactos.
//
// Uso: npm run db:limpiar-miembros --workspace packages/db
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const checkIns = await prisma.checkIn.deleteMany({});
  console.log(`🗑️  CheckIns borrados: ${checkIns.count}`);

  // CambioPlanAuditoria.miembroId es RESTRICT (ver diseño acordado: el
  // historial de auditoría no debe desaparecer silenciosamente en una baja
  // real) — este script de prueba sí necesita borrarlo primero, a mano,
  // porque es el único lugar que borra Miembro físicamente.
  const auditoriasCambioPlan = await prisma.cambioPlanAuditoria.deleteMany({});
  console.log(`🗑️  Auditorías de cambio de plan borradas: ${auditoriasCambioPlan.count}`);

  const pagos = await prisma.pago.deleteMany({});
  console.log(`🗑️  Pagos borrados: ${pagos.count}`);

  const suscripciones = await prisma.suscripcion.deleteMany({});
  console.log(`🗑️  Suscripciones borradas: ${suscripciones.count}`);

  const miembros = await prisma.miembro.deleteMany({});
  console.log(`🗑️  Miembros borrados: ${miembros.count}`);

  console.log("✅ Listo — no quedan miembros ni pagos/check-ins/suscripciones asociados.");
}

main()
  .catch((error) => {
    console.error("❌ Error al limpiar:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
