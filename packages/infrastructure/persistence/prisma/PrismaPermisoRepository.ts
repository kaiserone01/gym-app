import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IPermisoRepository } from "@gym-app/domain/ports/IPermisoRepository";
import type { Permiso, ModuloPermiso, AccionPermiso } from "@gym-app/domain/entities/Permiso";

export class PrismaPermisoRepository implements IPermisoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async tiene(usuarioId: string, modulo: ModuloPermiso, accion: AccionPermiso): Promise<boolean> {
    const permiso = await this.prisma.permisoUsuario.findUnique({
      where: { usuarioId_modulo_accion: { usuarioId, modulo, accion } },
    });
    return permiso !== null;
  }

  async listarPorUsuario(usuarioId: string): Promise<Permiso[]> {
    const permisos = await this.prisma.permisoUsuario.findMany({ where: { usuarioId } });
    return permisos.map((p) => ({ modulo: p.modulo, accion: p.accion }));
  }

  async reemplazarTodos(usuarioId: string, permisos: Permiso[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.permisoUsuario.deleteMany({ where: { usuarioId } }),
      this.prisma.permisoUsuario.createMany({
        data: permisos.map((p) => ({ usuarioId, modulo: p.modulo, accion: p.accion })),
      }),
    ]);
  }
}
