import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Otorga EN_SALA (VER + EDITAR) a socios, gerentes y recepción existentes, y a quien ya tenía
// SUCURSALES/VER (la vista que reemplaza /estadisticas). No toca ningún otro permiso ni a los
// entrenadores. Idempotente (upsert).
async function main() {
  const conSucursalesVer = await prisma.permisoUsuario.findMany({
    where: { modulo: "SUCURSALES", accion: "VER" },
    select: { usuarioId: true },
  });
  const porRol = await prisma.usuarioAdmin.findMany({
    where: { rol: { in: ["SOCIO", "GERENTE", "RECEPCION"] } },
    select: { id: true },
  });

  const ids = new Set([...conSucursalesVer.map((p) => p.usuarioId), ...porRol.map((u) => u.id)]);

  for (const usuarioId of ids) {
    for (const accion of ["VER", "EDITAR"] as const) {
      await prisma.permisoUsuario.upsert({
        where: { usuarioId_modulo_accion: { usuarioId, modulo: "EN_SALA", accion } },
        create: { usuarioId, modulo: "EN_SALA", accion },
        update: {},
      });
    }
  }

  console.log(`Permiso EN_SALA (VER + EDITAR) otorgado a ${ids.size} usuarios.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
