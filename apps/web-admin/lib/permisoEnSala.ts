import { prisma } from "@/lib/prisma";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";
import type { AccionPermiso } from "@gym-app/domain/entities/Permiso";

export async function tienePermisoEnSala(usuario: UsuarioAdmin, accion: AccionPermiso): Promise<boolean> {
  return usuario.rol === "SOCIO" || new PrismaPermisoRepository(prisma).tiene(usuario.id, "EN_SALA", accion);
}
