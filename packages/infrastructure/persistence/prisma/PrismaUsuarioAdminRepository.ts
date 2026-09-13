import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IUsuarioAdminRepository } from "@gym-app/domain/ports/IUsuarioAdminRepository";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

function mapear(usuario: {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  rol: UsuarioAdmin["rol"];
  email: string;
}): UsuarioAdmin {
  return {
    id: usuario.id,
    organizacionId: usuario.organizacionId,
    sucursalId: usuario.sucursalId,
    rol: usuario.rol,
    email: usuario.email,
  };
}

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
    return mapear(usuario);
  }

  async buscarPorId(id: string): Promise<UsuarioAdmin | null> {
    const usuario = await this.prisma.usuarioAdmin.findUnique({ where: { id } });
    if (!usuario) return null;
    return mapear(usuario);
  }

  async buscarCredencialesPorEmail(
    email: string
  ): Promise<{ usuario: UsuarioAdmin; passwordHash: string } | null> {
    const usuario = await this.prisma.usuarioAdmin.findUnique({ where: { email } });
    if (!usuario) return null;
    return { usuario: mapear(usuario), passwordHash: usuario.passwordHash };
  }
}
