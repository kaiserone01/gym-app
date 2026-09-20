import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { IMemberRepository } from "@gym-app/domain/ports/IMemberRepository";
import type { Miembro, DatosNuevoMiembro, CambiosMiembro } from "@gym-app/domain/entities/Miembro";

type FilaMiembro = {
  id: string;
  organizacionId: string;
  sucursalId: string;
  nombre: string;
  cedula: string;
  fechaInscripcion: Date | null;
  fechaNacimiento: Date | null;
  celular: string | null;
  fotoUrl: string | null;
  entrenadorId: string | null;
  entrenador?: { nombre: string } | null;
  planId: string | null;
  precioPlan: { toNumber(): number };
  fechaUltimoPago: Date | null;
  fechaVencimiento: Date | null;
  activo: boolean;
  createdAt: Date;
};

function mapear(miembro: FilaMiembro): Miembro {
  return {
    id: miembro.id,
    organizacionId: miembro.organizacionId,
    sucursalId: miembro.sucursalId,
    nombre: miembro.nombre,
    cedula: miembro.cedula,
    fechaInscripcion: miembro.fechaInscripcion,
    fechaNacimiento: miembro.fechaNacimiento,
    celular: miembro.celular,
    fotoUrl: miembro.fotoUrl,
    entrenadorId: miembro.entrenadorId,
    entrenadorNombre: miembro.entrenador?.nombre ?? null,
    planId: miembro.planId,
    precioPlan: miembro.precioPlan.toNumber(),
    fechaUltimoPago: miembro.fechaUltimoPago,
    fechaVencimiento: miembro.fechaVencimiento,
    activo: miembro.activo,
    createdAt: miembro.createdAt,
  };
}

export class PrismaMemberRepository implements IMemberRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async buscarPorOrganizacionYCedula(organizacionId: string, cedula: string): Promise<Miembro | null> {
    const miembro = await this.prisma.miembro.findUnique({
      where: { organizacionId_cedula: { organizacionId, cedula } },
      include: { entrenador: true },
    });

    if (!miembro) return null;

    return mapear(miembro);
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Miembro | null> {
    const miembro = await this.prisma.miembro.findUnique({
      where: { id },
      include: { entrenador: true },
    });

    if (!miembro || miembro.organizacionId !== organizacionId) return null;

    return mapear(miembro);
  }

  async listarPorOrganizacion(organizacionId: string): Promise<Miembro[]> {
    const miembros = await this.prisma.miembro.findMany({
      where: { organizacionId },
      include: { entrenador: true },
      orderBy: { nombre: "asc" },
    });

    return miembros.map(mapear);
  }

  async crear(datos: DatosNuevoMiembro): Promise<Miembro> {
    const miembro = await this.prisma.miembro.create({
      data: datos,
      include: { entrenador: true },
    });

    return mapear(miembro);
  }

  async actualizar(organizacionId: string, id: string, cambios: CambiosMiembro): Promise<Miembro | null> {
    const actual = await this.prisma.miembro.findUnique({ where: { id } });

    if (!actual || actual.organizacionId !== organizacionId) {
      return null;
    }

    const miembro = await this.prisma.miembro.update({
      where: { id },
      data: cambios,
      include: { entrenador: true },
    });

    return mapear(miembro);
  }

  async actualizarFechasPago(id: string, fechaUltimoPago: Date, fechaVencimiento: Date): Promise<void> {
    await this.prisma.miembro.update({
      where: { id },
      data: { fechaUltimoPago, fechaVencimiento },
    });
  }
}
