import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";
import { IProductoRepository } from "../ports/IProductoRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { DeudaProducto } from "../entities/DeudaProducto";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";
import {
  resolverItemsVenta,
  ProductoNoEncontradoError,
  ProductoInactivoError,
  CantidadInvalidaError,
  SinProductosError,
  ItemCarrito,
} from "./resolverItemsVenta";

export { MiembroFueraDeSucursalError, ProductoNoEncontradoError, ProductoInactivoError, CantidadInvalidaError, SinProductosError };
export type { ItemCarrito };

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para fiar productos.");
  }
}

export class MiembroNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el miembro.");
  }
}

export interface FiarProductoDeps {
  deudas: IDeudaProductoRepository;
  productos: IProductoRepository;
  miembros: IMemberRepository;
  sucursales: ISucursalRepository;
  autorizacion: IAuthorizationService;
}

export interface DatosFiarProducto {
  organizacionId: string;
  miembroId: string;
  items: ItemCarrito[];
  sucursalId: string;
  registradaPorId: string;
}

// Una deuda por producto del carrito. Debe correr dentro de una transacción
// (ver fiarProductoAction) para que un fiado nunca quede a medias.
export async function fiarProducto(deps: FiarProductoDeps, input: DatosFiarProducto): Promise<DeudaProducto[]> {
  if (!(await deps.autorizacion.tienePermiso(input.registradaPorId, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  const items = await resolverItemsVenta(deps.productos, input.organizacionId, input.items);

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }
  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  const deudas: DeudaProducto[] = [];
  for (const { producto, cantidad } of items) {
    deudas.push(
      await deps.deudas.crear({
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        miembroId: input.miembroId,
        productoId: producto.id,
        productoNombre: producto.nombre,
        cantidad,
        precioUnitarioUSD: producto.costoUSD,
        registradaPorId: input.registradaPorId,
      })
    );
  }

  return deudas;
}
