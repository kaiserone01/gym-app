import { IProductoRepository } from "../ports/IProductoRepository";
import { Producto } from "../entities/Producto";

export class ProductoNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el producto.");
  }
}

export class ProductoInactivoError extends Error {
  constructor() {
    super("No se puede vender un producto inactivo.");
  }
}

export class CantidadInvalidaError extends Error {
  constructor() {
    super("La cantidad tiene que ser un número entero mayor a 0.");
  }
}

export class SinProductosError extends Error {
  constructor() {
    super("Elige al menos un producto.");
  }
}

export interface ItemCarrito {
  productoId: string;
  cantidad: number;
}

export interface ItemResuelto {
  producto: Producto;
  cantidad: number;
}

// Valida el carrito de una venta (o de un fiado) y lo resuelve contra el
// catálogo de la organización. Un mismo producto repetido se suma en una sola
// línea. No escribe nada: si algún producto es inválido, falla antes de crear
// pagos o deudas.
export async function resolverItemsVenta(
  productos: IProductoRepository,
  organizacionId: string,
  items: ItemCarrito[]
): Promise<ItemResuelto[]> {
  if (items.length === 0) {
    throw new SinProductosError();
  }

  const cantidades = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.cantidad) || item.cantidad < 1) {
      throw new CantidadInvalidaError();
    }
    cantidades.set(item.productoId, (cantidades.get(item.productoId) ?? 0) + item.cantidad);
  }

  const resueltos: ItemResuelto[] = [];
  for (const [productoId, cantidad] of cantidades) {
    const producto = await productos.buscarPorId(organizacionId, productoId);
    if (!producto) {
      throw new ProductoNoEncontradoError();
    }
    if (!producto.activo) {
      throw new ProductoInactivoError();
    }
    resueltos.push({ producto, cantidad });
  }

  return resueltos;
}
