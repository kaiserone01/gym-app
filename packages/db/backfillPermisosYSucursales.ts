import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../../.env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PERMISOS_POR_ROL: Record<string, Array<{ modulo: string; accion: string }>> = {
  SOCIO: [
    ...["MIEMBROS", "PAGOS", "PLANES", "CAJA", "USUARIOS", "SUCURSALES"].flatMap((modulo) =>
      ["VER", "CREAR", "EDITAR", "ELIMINAR"].map((accion) => ({ modulo, accion }))
    ),
  ],
  GERENTE: [
    ...["MIEMBROS", "PAGOS", "CAJA"].flatMap((modulo) =>
      ["VER", "CREAR", "EDITAR", "ELIMINAR"].map((accion) => ({ modulo, accion }))
    ),
    { modulo: "PLANES", accion: "VER" },
    { modulo: "PLANES", accion: "CREAR" },
    { modulo: "PLANES", accion: "EDITAR" },
    { modulo: "USUARIOS", accion: "VER" },
    { modulo: "SUCURSALES", accion: "VER" },
  ],
  RECEPCION: [
    { modulo: "MIEMBROS", accion: "VER" },
    { modulo: "MIEMBROS", accion: "CREAR" },
    { modulo: "MIEMBROS", accion: "EDITAR" },
    { modulo: "PAGOS", accion: "VER" },
    { modulo: "PAGOS", accion: "CREAR" },
    { modulo: "PLANES", accion: "VER" },
    { modulo: "CAJA", accion: "VER" },
    { modulo: "CAJA", accion: "CREAR" },
  ],
  // Los entrenadores no operan el panel — sin permisos (ver CrearUsuarioAdmin.ts,
  // debe mantenerse igual acá).
  ENTRENADOR: [],
};

async function main() {
  const usuarios = await prisma.usuarioAdmin.findMany();
  let sucursalesCreadas = 0;
  let permisosCreados = 0;

  for (const usuario of usuarios) {
    if (usuario.sucursalId) {
      await prisma.usuarioSucursal.upsert({
        where: { usuarioId_sucursalId: { usuarioId: usuario.id, sucursalId: usuario.sucursalId } },
        create: { usuarioId: usuario.id, sucursalId: usuario.sucursalId },
        update: {},
      });
      sucursalesCreadas++;
    }

    const permisos = PERMISOS_POR_ROL[usuario.rol] ?? [];
    for (const permiso of permisos) {
      await prisma.permisoUsuario.upsert({
        where: {
          usuarioId_modulo_accion: {
            usuarioId: usuario.id,
            modulo: permiso.modulo as never,
            accion: permiso.accion as never,
          },
        },
        create: { usuarioId: usuario.id, modulo: permiso.modulo as never, accion: permiso.accion as never },
        update: {},
      });
      permisosCreados++;
    }
  }

  console.log(`Backfill completo: ${sucursalesCreadas} asignaciones de sucursal, ${permisosCreados} permisos (upsert, incluye ya existentes).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
