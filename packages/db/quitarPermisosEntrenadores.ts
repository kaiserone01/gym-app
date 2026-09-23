// Los entrenadores ya no reciben permisos del panel (ver CrearUsuarioAdmin.ts) —
// este script limpia los permisos que hayan quedado asignados a entrenadores
// ya existentes, de antes de ese cambio.
//
// Uso: npm run db:quitar-permisos-entrenadores --workspace packages/db
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const entrenadores = await prisma.usuarioAdmin.findMany({
    where: { rol: "ENTRENADOR" },
    select: { id: true, nombre: true, email: true },
  });

  if (entrenadores.length === 0) {
    console.log("✅ No hay entrenadores en la base — nada que hacer.");
    return;
  }

  const permisos = await prisma.permisoUsuario.deleteMany({
    where: { usuarioId: { in: entrenadores.map((e) => e.id) } },
  });

  console.log(`🗑️  Permisos borrados: ${permisos.count} (de ${entrenadores.length} entrenadores)`);
  entrenadores.forEach((e) => console.log(`   - ${e.nombre || e.email}`));
  console.log("✅ Listo — los entrenadores ya no tienen permisos del panel.");
}

main()
  .catch((error) => {
    console.error("❌ Error al quitar permisos:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
