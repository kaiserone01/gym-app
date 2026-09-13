import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IUsuarioAdminRepository } from "@gym-app/domain/ports/IUsuarioAdminRepository";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

export class PrismaUsuarioAdminRepository implements IUsuarioAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: {
    organizacionId: string;
    sucursalId: string | null;
    email: string;
    passwordHash: string;
    rol: UsuarioAdmin["rol"];
  }): Promise<UsuarioAdmin> {
    const usuario = await this.prisma.usuarioAdmin.create({ data: datos });
    return {
      id: usuario.id,
      organizacionId: usuario.organizacionId,
      sucursalId: usuario.sucursalId,
      rol: usuario.rol,
      email: usuario.email,
    };
  }
}
