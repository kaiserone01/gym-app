import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IUsuarioAdminRepository } from "@gym-app/domain/ports/IUsuarioAdminRepository";
import type { UsuarioAdmin, CambiosUsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";

function mapear(usuario: {
  id: string;
  organizacionId: string;
  sucursalId: string | null;
  nombre: string;
  rol: UsuarioAdmin["rol"];
  email: string;
  activo: boolean;
}): UsuarioAdmin {
  return {
    id: usuario.id,
    organizacionId: usuario.organizacionId,
    sucursalId: usuario.sucursalId,
    nombre: usuario.nombre,
    rol: usuario.rol,
    email: usuario.email,
    activo: usuario.activo,
  };
}

export class PrismaUsuarioAdminRepository implements IUsuarioAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: {
    organizacionId: string;
    sucursalId: string | null;
    nombre: string;
    email: string;
    passwordHash: string;
    rol: UsuarioAdmin["rol"];
  }): Promise<UsuarioAdmin> {
    const usuario = await this.prisma.usuarioAdmin.create({ data: datos });
    return mapear(usuario);
  }

  async buscarPorId(organizacionId: string, id: string): Promise<UsuarioAdmin | null> {
    const usuario = await this.prisma.usuarioAdmin.findFirst({ where: { id, organizacionId } });
    return usuario ? mapear(usuario) : null;
  }

  async buscarPorIdSinOrganizacion(id: string): Promise<UsuarioAdmin | null> {
    const usuario = await this.prisma.usuarioAdmin.findUnique({ where: { id } });
    return usuario ? mapear(usuario) : null;
  }

  async buscarCredencialesPorEmail(
    email: string
  ): Promise<{ usuario: UsuarioAdmin; passwordHash: string } | null> {
    const usuario = await this.prisma.usuarioAdmin.findUnique({ where: { email } });
    if (!usuario) return null;
    return { usuario: mapear(usuario), passwordHash: usuario.passwordHash };
  }

  async listarPorOrganizacion(organizacionId: string): Promise<UsuarioAdmin[]> {
    const usuarios = await this.prisma.usuarioAdmin.findMany({
      where: { organizacionId },
      orderBy: { nombre: "asc" },
    });
    return usuarios.map(mapear);
  }

  async actualizar(organizacionId: string, id: string, cambios: CambiosUsuarioAdmin): Promise<UsuarioAdmin | null> {
    const existente = await this.prisma.usuarioAdmin.findFirst({ where: { id, organizacionId } });
    if (!existente) return null;

    const usuario = await this.prisma.usuarioAdmin.update({ where: { id }, data: cambios });
    return mapear(usuario);
  }

  async eliminar(id: string): Promise<void> {
    await this.prisma.usuarioAdmin.delete({ where: { id } });
  }

  async buscarPasswordHashPorId(id: string): Promise<string | null> {
    const usuario = await this.prisma.usuarioAdmin.findUnique({
      where: { id },
      select: { passwordHash: true },
    });
    return usuario?.passwordHash ?? null;
  }

  async actualizarPassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.usuarioAdmin.update({ where: { id }, data: { passwordHash } });
  }
}
