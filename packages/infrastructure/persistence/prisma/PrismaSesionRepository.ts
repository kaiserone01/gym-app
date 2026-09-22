import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ISesionRepository } from "@gym-app/domain/ports/ISesionRepository";
import type { Sesion } from "@gym-app/domain/entities/Sesion";

function mapear(fila: { id: string; token: string; usuarioId: string; sucursalActivaId: string | null; expiraEn: Date }): Sesion {
  // Se mapea tal cual viene (puede ser null en sesiones viejas, ver
  // Sesion.sucursalActivaId) — ValidarSesion es quien decide qué hacer
  // con una sesión sin sucursal, acá no se fuerza el tipo con "!".
  return { id: fila.id, token: fila.token, usuarioId: fila.usuarioId, sucursalActivaId: fila.sucursalActivaId, expiraEn: fila.expiraEn };
}

export class PrismaSesionRepository implements ISesionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: { usuarioId: string; token: string; expiraEn: Date; sucursalActivaId: string }): Promise<Sesion> {
    const sesion = await this.prisma.sesion.create({ data: datos });
    return mapear(sesion);
  }

  async buscarPorToken(token: string): Promise<Sesion | null> {
    const sesion = await this.prisma.sesion.findUnique({ where: { token } });
    if (!sesion) return null;
    return mapear(sesion);
  }

  async eliminarPorToken(token: string): Promise<void> {
    // deleteMany en vez de delete: un logout de un token ya vencido/inexistente
    // no debe lanzar error (idempotente).
    await this.prisma.sesion.deleteMany({ where: { token } });
  }
}
