import { prisma } from "@/lib/prisma";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { obtenerSucursalesVisiblesParaUsuario } from "@gym-app/domain/use-cases/ObtenerSucursalesVisiblesParaUsuario";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

// Wrapper fino: arma los repositorios Prisma y delega al caso de uso de
// dominio (ver ObtenerSucursalesVisiblesParaUsuario — consolida lo que
// antes estaba duplicado acá y en miembros/obtenerSucursalesVisibles.ts).
// Se mantiene este archivo/nombre para no romper los imports existentes
// en caja/page.tsx, caja/obtenerTurnoAbiertoParaUsuario.ts y
// api/caja/ultimo-cierre/route.ts.
export async function obtenerSucursalesVisiblesParaTurno(usuario: UsuarioAdmin): Promise<SucursalResumen[]> {
  return obtenerSucursalesVisiblesParaUsuario(
    { sucursales: new PrismaSucursalRepository(prisma), usuarioSucursales: new PrismaUsuarioSucursalRepository(prisma) },
    usuario
  );
}
