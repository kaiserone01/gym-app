// Borra TODOS los pagos y cierres de caja de prueba.
// Los datos en estas tablas son de prueba y deben limpiarse antes
// de la migración de schema que agrega el sistema de Turnos.
//
// Uso: npm run db:limpiar-caja-prueba --workspace packages/db
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const pagos = await prisma.pago.deleteMany({});
  console.log(`🗑️  Pagos borrados: ${pagos.count}`);

  const cierres = await prisma.cierreCaja.deleteMany({});
  console.log(`🗑️  Cierres de caja borrados: ${cierres.count}`);

  console.log("✅ Listo — no quedan pagos ni cierres de caja de prueba.");
}

main()
  .catch((error) => {
    console.error("❌ Error al limpiar:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
