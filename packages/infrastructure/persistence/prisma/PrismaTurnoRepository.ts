import type { PrismaClient } from "@gym-app/db/generated/prisma/client";
import type { ITurnoRepository } from "@gym-app/domain/ports/ITurnoRepository";
import type { Turno, DatosNuevoTurno } from "@gym-app/domain/entities/Turno";

type FilaTurno = {
  id: string;
  organizacionId: string;
  sucursalId: string;
  usuarioId: string;
  fondoInicialEfectivoUSD: { toNumber(): number };
  fondoInicialEfectivoBs: { toNumber(): number };
  abiertoEn: Date;
  cerradoEn: Date | null;
  estado: "ABIERTO" | "CERRADO";
};

function mapear(fila: FilaTurno): Turno {
  return {
    id: fila.id,
    organizacionId: fila.organizacionId,
    sucursalId: fila.sucursalId,
    usuarioId: fila.usuarioId,
    fondoInicialEfectivoUSD: fila.fondoInicialEfectivoUSD.toNumber(),
    fondoInicialEfectivoBs: fila.fondoInicialEfectivoBs.toNumber(),
    abiertoEn: fila.abiertoEn,
    cerradoEn: fila.cerradoEn,
    estado: fila.estado,
  };
}

export class PrismaTurnoRepository implements ITurnoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crear(datos: DatosNuevoTurno): Promise<Turno> {
    const turno = await this.prisma.turno.create({
      data: {
        organizacionId: datos.organizacionId,
        sucursalId: datos.sucursalId,
        usuarioId: datos.usuarioId,
        fondoInicialEfectivoUSD: datos.fondoInicialEfectivoUSD,
        fondoInicialEfectivoBs: datos.fondoInicialEfectivoBs,
      },
    });
    return mapear(turno);
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Turno | null> {
    const turno = await this.prisma.turno.findFirst({ where: { id, organizacionId } });
    return turno ? mapear(turno) : null;
  }

  async buscarAbiertoPorSucursal(sucursalId: string): Promise<Turno | null> {
    const turno = await this.prisma.turno.findFirst({
      where: { sucursalId, estado: "ABIERTO" },
    });
    return turno ? mapear(turno) : null;
  }

  async buscarAbiertoEntreSucursales(sucursalIds: string[]): Promise<Turno | null> {
    if (sucursalIds.length === 0) return null;
    const turno = await this.prisma.turno.findFirst({
      where: { sucursalId: { in: sucursalIds }, estado: "ABIERTO" },
    });
    return turno ? mapear(turno) : null;
  }

  async buscarUltimoCerradoPorSucursal(sucursalId: string): Promise<Turno | null> {
    const turno = await this.prisma.turno.findFirst({
      where: { sucursalId, estado: "CERRADO" },
      orderBy: { cerradoEn: "desc" },
    });
    return turno ? mapear(turno) : null;
  }

  async cerrar(id: string, cerradoEn: Date): Promise<Turno> {
    const turno = await this.prisma.turno.update({
      where: { id },
      data: { estado: "CERRADO", cerradoEn },
    });
    return mapear(turno);
  }

  async listarPorOrganizacionYRango(organizacionId: string, desde: Date, hasta: Date): Promise<Turno[]> {
    const turnos = await this.prisma.turno.findMany({
      where: { organizacionId, abiertoEn: { gte: desde, lte: hasta } },
      orderBy: { abiertoEn: "desc" },
      include: { usuario: true },
    });
    return turnos.map((turno) => ({ ...mapear(turno), usuarioNombre: turno.usuario.nombre }));
  }

  async listarFechasConTurno(organizacionId: string): Promise<Date[]> {
    // "abiertoEn AT TIME ZONE 'UTC' AT TIME ZONE 'America/Caracas'"
    // convierte la columna (guardada en UTC) al horario de pared de
    // Venezuela y la devuelve como un timestamp SIN zona — Postgres no le
    // agrega ninguna, pero el driver de Node la etiqueta como UTC al
    // mapearla a Date (le agrega "Z"), lo cual correría el día una vez
    // más al convertir de vuelta a local en el cliente (ver bug
    // encontrado en la verificación manual de este plan). Por eso NO se
    // usa DATE_TRUNC ni se devuelve el Date de Postgres directo: se pide
    // el día/mes/año ya como enteros (EXTRACT) y se reconstruye el Date
    // acá mismo con el constructor local (new Date(año, mes, día)) — ese
    // constructor asume la zona del proceso, que es America/Caracas
    // (TZ=America/Caracas, ver Task 1), la misma que usará el navegador
    // del cliente al comparar contra esta lista.
    const filas = await this.prisma.$queryRaw<{ anio: number; mes: number; dia: number }[]>`
      SELECT DISTINCT
        EXTRACT(YEAR FROM ("abiertoEn" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Caracas'))::int AS anio,
        EXTRACT(MONTH FROM ("abiertoEn" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Caracas'))::int AS mes,
        EXTRACT(DAY FROM ("abiertoEn" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Caracas'))::int AS dia
      FROM "Turno"
      WHERE "organizacionId" = ${organizacionId}
      ORDER BY anio ASC, mes ASC, dia ASC
    `;
    return filas.map((fila) => new Date(fila.anio, fila.mes - 1, fila.dia));
  }
}
