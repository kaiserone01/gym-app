import { prisma } from "@/lib/prisma";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

// Las sucursales que un usuario puede asignarle a un Miembro: SOCIO ve
// todas las de la organización; el resto de roles, solo las que tiene
// asignadas (UsuarioSucursal) — evita que un recepcionista de una sede
// cree/mueva miembros a una sucursal que no administra.
export async function obtenerSucursalesVisiblesParaMiembro(usuario: UsuarioAdmin): Promise<SucursalResumen[]> {
  const todas = await listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId);

  if (usuario.rol === "SOCIO") {
    return todas;
  }

  const idsAsignados = new Set(
    await new PrismaUsuarioSucursalRepository(prisma).listarSucursalIdsPorUsuario(usuario.id)
  );

  return todas.filter((sucursal) => idsAsignados.has(sucursal.id));
}
