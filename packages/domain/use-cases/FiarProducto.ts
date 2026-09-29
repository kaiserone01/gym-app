import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";
import { IProductoRepository } from "../ports/IProductoRepository";
import { IMemberRepository } from "../ports/IMemberRepository";
import { ISucursalRepository } from "../ports/ISucursalRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { DeudaProducto } from "../entities/DeudaProducto";
import { MiembroFueraDeSucursalError } from "./ObtenerMiembro";
import { ProductoNoEncontradoError, ProductoInactivoError, CantidadInvalidaError } from "./VenderProducto";

export { MiembroFueraDeSucursalError, ProductoNoEncontradoError, ProductoInactivoError, CantidadInvalidaError };

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
  productoId: string;
  cantidad: number;
  sucursalId: string;
  registradaPorId: string;
}

export async function fiarProducto(deps: FiarProductoDeps, input: DatosFiarProducto): Promise<DeudaProducto> {
  if (!(await deps.autorizacion.tienePermiso(input.registradaPorId, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  if (!Number.isInteger(input.cantidad) || input.cantidad < 1) {
    throw new CantidadInvalidaError();
  }

  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) {
    throw new MiembroNoEncontradoError();
  }
  if (miembro.sucursalId !== null && miembro.sucursalId !== input.sucursalId) {
    const sucursal = await deps.sucursales.buscarPorId(input.organizacionId, miembro.sucursalId);
    throw new MiembroFueraDeSucursalError(sucursal?.nombre ?? "otra sucursal");
  }

  const producto = await deps.productos.buscarPorId(input.organizacionId, input.productoId);
  if (!producto) {
    throw new ProductoNoEncontradoError();
  }
  if (!producto.activo) {
    throw new ProductoInactivoError();
  }

  return deps.deudas.crear({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    miembroId: input.miembroId,
    productoId: producto.id,
    productoNombre: producto.nombre,
    cantidad: input.cantidad,
    precioUnitarioUSD: producto.costoUSD,
    registradaPorId: input.registradaPorId,
  });
}
