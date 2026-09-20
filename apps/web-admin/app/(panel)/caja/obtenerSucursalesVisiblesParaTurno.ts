import { prisma } from "@/lib/prisma";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PrismaUsuarioSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaUsuarioSucursalRepository";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

// Las sucursales entre las que un operador puede elegir al abrir turno:
// SOCIO ve todas las de la organización; Gerente/Recepción solo las que
// tiene asignadas (UsuarioSucursal) — mismo patrón que
// obtenerSucursalesVisiblesParaMiembro en miembros/obtenerSucursalesVisibles.ts.
export async function obtenerSucursalesVisiblesParaTurno(usuario: UsuarioAdmin): Promise<SucursalResumen[]> {
  const todas = await listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId);

  if (usuario.rol === "SOCIO") {
    return todas;
  }

  const idsAsignados = new Set(
    await new PrismaUsuarioSucursalRepository(prisma).listarSucursalIdsPorUsuario(usuario.id)
  );

  return todas.filter((sucursal) => idsAsignados.has(sucursal.id));
}
