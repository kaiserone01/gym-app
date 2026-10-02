// Función de UN SOLO USO: marca a todos los miembros de la migración del Excel
// (organización de prueba "migracion-adrenalina-test") con el aviso "Ajustar fecha",
// porque ninguna fecha de vencimiento migrada es la real. El aviso se apaga solo
// cuando el socio ajusta la fecha en la ficha o se registra un pago.
// (Las migraciones nuevas ya marcan a cada miembro al crearlo — ver migrarExcelAdrenalina.ts.)
//
// Uso: npm run db:marcar-ajustar-fecha --workspace packages/db
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const SLUG_ORGANIZACION_PRUEBA = "migracion-adrenalina-test";

async function main() {
  const organizacion = await prisma.organizacion.findUnique({ where: { slug: SLUG_ORGANIZACION_PRUEBA } });
  if (!organizacion) {
    console.log(`No existe la organización "${SLUG_ORGANIZACION_PRUEBA}" — nada que marcar.`);
    return;
  }
  const { count } = await prisma.miembro.updateMany({
    where: { organizacionId: organizacion.id, ajustarFecha: false },
    data: { ajustarFecha: true },
  });
  console.log(`✅ ${count} miembros marcados con "Ajustar fecha" en "${SLUG_ORGANIZACION_PRUEBA}".`);
}

main()
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
