import { prisma } from "@/lib/prisma";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { obtenerSucursalesVisiblesParaUsuario } from "@gym-app/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

// Wrapper fino: ver caja/obtenerSucursalesVisiblesParaTurno.ts (mismo
// patrón, misma consolidación en ObtenerSucursalesVisiblesParaUsuario).
// Se mantiene este archivo/nombre para no romper los imports existentes
// en pagos/nuevo/page.tsx, miembros/nuevo/page.tsx y miembros/[id]/page.tsx.
export async function obtenerSucursalesVisiblesParaMiembro(usuario: UsuarioAdmin): Promise<SucursalResumen[]> {
  return obtenerSucursalesVisiblesParaUsuario(
    { sucursales: new PrismaSucursalRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) },
    usuario
  );
}
