import type { PrismaClient, VitrinaItem as FilaVitrinaItem } from "@gym-app/db/generated/prisma/client";
import type { IVitrinaRepository } from "@gym-app/domain/ports/IVitrinaRepository";
import {
  TRANSICIONES_VITRINA,
  type AjustesVitrina,
  type CambiosVitrinaItem,
  type DatosVitrinaItem,
  type TransicionVitrina,
  type VitrinaItem,
} from "@gym-app/domain/entities/Vitrina";

const aNumero = (valor: { toString(): string } | null): number | null => (valor === null ? null : Number(valor));

function mapear(fila: FilaVitrinaItem): VitrinaItem {
  return {
    id: fila.id,
    sucursalId: fila.sucursalId,
    tipo: fila.tipo,
    orden: fila.orden,
    activo: fila.activo,
    duracionSeg: fila.duracionSeg,
    inicio: fila.inicio,
    fin: fila.fin,
    mediaUrl: fila.mediaUrl,
    mediaTipo: fila.mediaTipo,
    posterUrl: fila.posterUrl,
    precioUSD: aNumero(fila.precioUSD),
    ofertaUSD: aNumero(fila.ofertaUSD),
    descuentoPct: fila.descuentoPct,
    etiqueta: fila.etiqueta,
    mostrarPrecio: fila.mostrarPrecio,
    mostrarOferta: fila.mostrarOferta,
    mostrarDescuento: fila.mostrarDescuento,
    mostrarEtiqueta: fila.mostrarEtiqueta,
    mostrarEquivalenteBs: fila.mostrarEquivalenteBs,
    nombre: fila.nombre,
    especialidad: fila.especialidad,
    frase: fila.frase,
    mostrarMedio: fila.mostrarMedio,
    mostrarNombre: fila.mostrarNombre,
    mostrarEspecialidad: fila.mostrarEspecialidad,
    mostrarFrase: fila.mostrarFrase,
  };
}

const sinIndefinidos = <T extends object>(objeto: T): T =>
  Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined)) as T;

const subirVersion = { vitrinaVersion: { increment: 1 } };

export class PrismaVitrinaRepository implements IVitrinaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listar(sucursalId: string): Promise<VitrinaItem[]> {
    const filas = await this.prisma.vitrinaItem.findMany({ where: { sucursalId }, orderBy: [{ orden: "asc" }, { id: "asc" }] });
    return filas.map(mapear);
  }

  async buscar(sucursalId: string, id: string): Promise<VitrinaItem | null> {
    const fila = await this.prisma.vitrinaItem.findFirst({ where: { id, sucursalId } });
    return fila ? mapear(fila) : null;
  }

  async urlEnUso(url: string, exceptoItemId?: string): Promise<boolean> {
    const fila = await this.prisma.vitrinaItem.findFirst({
      where: { OR: [{ mediaUrl: url }, { posterUrl: url }], ...(exceptoItemId ? { id: { not: exceptoItemId } } : {}) },
      select: { id: true },
    });
    return fila !== null;
  }

  async crear(sucursalId: string, datos: DatosVitrinaItem): Promise<VitrinaItem> {
    return this.prisma.$transaction(async (tx) => {
      const maximo = await tx.vitrinaItem.aggregate({ where: { sucursalId }, _max: { orden: true } });
      const fila = await tx.vitrinaItem.create({
        data: { ...datos, sucursalId, orden: (maximo._max.orden ?? -1) + 1, activo: false },
      });
      await tx.sucursal.update({ where: { id: sucursalId }, data: subirVersion });
      return mapear(fila);
    });
  }

  async actualizar(sucursalId: string, id: string, cambios: CambiosVitrinaItem): Promise<VitrinaItem | null> {
    return this.prisma.$transaction(async (tx) => {
      const existente = await tx.vitrinaItem.findFirst({ where: { id, sucursalId } });
      if (!existente) return null;
      const fila = await tx.vitrinaItem.update({ where: { id }, data: sinIndefinidos(cambios) });
      await tx.sucursal.update({ where: { id: sucursalId }, data: subirVersion });
      return mapear(fila);
    });
  }

  async eliminar(sucursalId: string, id: string): Promise<VitrinaItem | null> {
    return this.prisma.$transaction(async (tx) => {
      const existente = await tx.vitrinaItem.findFirst({ where: { id, sucursalId } });
      if (!existente) return null;
      await tx.vitrinaItem.delete({ where: { id } });
      await tx.sucursal.update({ where: { id: sucursalId }, data: subirVersion });
      return mapear(existente);
    });
  }

  async mover(sucursalId: string, id: string, direccion: "SUBIR" | "BAJAR"): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.vitrinaItem.findMany({
        where: { sucursalId },
        select: { id: true, orden: true },
        orderBy: [{ orden: "asc" }, { id: "asc" }],
      });
      const indice = filas.findIndex((f) => f.id === id);
      const destino = direccion === "SUBIR" ? indice - 1 : indice + 1;
      if (indice === -1 || destino < 0 || destino >= filas.length) return false;

      const ids = filas.map((f) => f.id);
      [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
      // Reescribe el orden como 0..n-1 (también limpia huecos y empates que dejen los borrados).
      for (const [posicion, itemId] of ids.entries()) {
        if (filas[posicion].id !== itemId || filas[posicion].orden !== posicion) {
          await tx.vitrinaItem.update({ where: { id: itemId }, data: { orden: posicion } });
        }
      }
      await tx.sucursal.update({ where: { id: sucursalId }, data: subirVersion });
      return true;
    });
  }

  async obtenerAjustes(sucursalId: string): Promise<AjustesVitrina> {
    const sucursal = await this.prisma.sucursal.findUniqueOrThrow({
      where: { id: sucursalId },
      select: { vitrinaDuracionSeg: true, vitrinaTransicion: true, vitrinaVersion: true },
    });
    return {
      duracionSeg: sucursal.vitrinaDuracionSeg,
      transicion: normalizarTransicion(sucursal.vitrinaTransicion),
      version: sucursal.vitrinaVersion,
    };
  }

  async guardarAjustes(sucursalId: string, ajustes: { duracionSeg: number; transicion: TransicionVitrina }): Promise<AjustesVitrina> {
    const sucursal = await this.prisma.sucursal.update({
      where: { id: sucursalId },
      data: { vitrinaDuracionSeg: ajustes.duracionSeg, vitrinaTransicion: ajustes.transicion, ...subirVersion },
      select: { vitrinaDuracionSeg: true, vitrinaTransicion: true, vitrinaVersion: true },
    });
    return {
      duracionSeg: sucursal.vitrinaDuracionSeg,
      transicion: normalizarTransicion(sucursal.vitrinaTransicion),
      version: sucursal.vitrinaVersion,
    };
  }
}

function normalizarTransicion(valor: string): TransicionVitrina {
  return (TRANSICIONES_VITRINA as readonly string[]).includes(valor) ? (valor as TransicionVitrina) : "FUNDIDO";
}
