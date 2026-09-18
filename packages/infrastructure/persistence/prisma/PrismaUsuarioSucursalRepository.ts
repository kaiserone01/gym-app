import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IUsuarioSucursalRepository } from "@gym-app/domain/ports/IUsuarioSucursalRepository";

export class PrismaUsuarioSucursalRepository implements IUsuarioSucursalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listarSucursalIdsPorUsuario(usuarioId: string): Promise<string[]> {
    const filas = await this.prisma.usuarioSucursal.findMany({ where: { usuarioId } });
    return filas.map((f) => f.sucursalId);
  }

  async reemplazarTodas(usuarioId: string, sucursalIds: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.usuarioSucursal.deleteMany({ where: { usuarioId } }),
      this.prisma.usuarioSucursal.createMany({
        data: sucursalIds.map((sucursalId) => ({ usuarioId, sucursalId })),
      }),
    ]);
  }
}
