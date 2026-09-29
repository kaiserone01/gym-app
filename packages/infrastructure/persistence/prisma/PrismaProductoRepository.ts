import type { PrismaClientOrTx } from "./PrismaClientOrTx";
import type { IProductoRepository } from "@gym-app/domain/ports/IProductoRepository";
import type { Producto, DatosNuevoProducto, CambiosProducto } from "@gym-app/domain/entities/Producto";

type FilaProducto = {
  id: string;
  organizacionId: string;
  nombre: string;
  descripcion: string | null;
  costoUSD: { toNumber(): number };
  fotoUrl: string | null;
  activo: boolean;
};

function mapear(producto: FilaProducto): Producto {
  return {
    id: producto.id,
    organizacionId: producto.organizacionId,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    costoUSD: producto.costoUSD.toNumber(),
    fotoUrl: producto.fotoUrl,
    activo: producto.activo,
  };
}

export class PrismaProductoRepository implements IProductoRepository {
  constructor(private readonly prisma: PrismaClientOrTx) {}

  async listarPorOrganizacion(organizacionId: string): Promise<Producto[]> {
    const productos = await this.prisma.producto.findMany({ where: { organizacionId }, orderBy: { nombre: "asc" } });
    return productos.map(mapear);
  }

  async buscarPorId(organizacionId: string, id: string): Promise<Producto | null> {
    const producto = await this.prisma.producto.findUnique({ where: { id } });
    if (!producto || producto.organizacionId !== organizacionId) return null;
    return mapear(producto);
  }

  async crear(datos: DatosNuevoProducto): Promise<Producto> {
    return mapear(await this.prisma.producto.create({ data: datos }));
  }

  async actualizar(organizacionId: string, id: string, cambios: CambiosProducto): Promise<Producto | null> {
    const actual = await this.prisma.producto.findUnique({ where: { id } });
    if (!actual || actual.organizacionId !== organizacionId) return null;
    return mapear(await this.prisma.producto.update({ where: { id }, data: cambios }));
  }

  async contarVentas(id: string): Promise<number> {
    return this.prisma.pago.count({ where: { productoId: id } });
  }

  async eliminar(id: string): Promise<void> {
    await this.prisma.producto.delete({ where: { id } });
  }
}
