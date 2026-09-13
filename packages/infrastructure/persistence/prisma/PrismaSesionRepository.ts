import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISesionRepository } from "@gym-app/domain/ports/ISesionRepository";
import type { Sesion } from "@gym-app/domain/entities/Sesion";

export class PrismaSesionRepository implements ISesionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: { usuarioId: string; token: string; expiraEn: Date }): Promise<Sesion> {
    const sesion = await this.prisma.sesion.create({ data: datos });
    return { id: sesion.id, token: sesion.token, usuarioId: sesion.usuarioId, expiraEn: sesion.expiraEn };
  }

  async buscarPorToken(token: string): Promise<Sesion | null> {
    const sesion = await this.prisma.sesion.findUnique({ where: { token } });
    if (!sesion) return null;
    return { id: sesion.id, token: sesion.token, usuarioId: sesion.usuarioId, expiraEn: sesion.expiraEn };
  }

  async eliminarPorToken(token: string): Promise<void> {
    // deleteMany en vez de delete: un logout de un token ya vencido/inexistente
    // no debe lanzar error (idempotente).
    await this.prisma.sesion.deleteMany({ where: { token } });
  }
}
