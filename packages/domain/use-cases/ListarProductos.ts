import { IProductoRepository } from "../ports/IProductoRepository";
import { Producto } from "../entities/Producto";

export async function listarProductos(
  deps: { productos: IProductoRepository },
  organizacionId: string
): Promise<Producto[]> {
  return deps.productos.listarPorOrganizacion(organizacionId);
}
