import { randomUUID } from "node:crypto";
import { IPagoRepository } from "../ports/IPagoRepository";
import { IProductoRepository } from "../ports/IProductoRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { Pago, DatosLineaPago, validarLineasDePago } from "../entities/Pago";
import { conceptoDeudas, totalDeudas } from "../entities/DeudaProducto";
import {
  resolverItemsVenta,
  ProductoNoEncontradoError,
  ProductoInactivoError,
  CantidadInvalidaError,
  SinProductosError,
  ItemCarrito,
} from "./resolverItemsVenta";

export { ProductoNoEncontradoError, ProductoInactivoError, CantidadInvalidaError, SinProductosError };
export type { ItemCarrito };

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para vender productos.");
  }
}

export class SinTurnoAbiertoError extends Error {
  constructor() {
    super("Abre un turno de caja antes de vender productos.");
  }
}

export interface VenderProductoDeps {
  pagos: IPagoRepository;
  productos: IProductoRepository;
  turnos: ITurnoRepository;
  autorizacion: IAuthorizationService;
}

export interface DatosVenderProducto {
  organizacionId: string;
  items: ItemCarrito[];
  lineas: DatosLineaPago[];
  sucursalId: string;
  registradoPorId: string;
}

export async function venderProducto(deps: VenderProductoDeps, input: DatosVenderProducto): Promise<Pago[]> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  const items = await resolverItemsVenta(deps.productos, input.organizacionId, input.items);

  // El total lo calcula el servidor con el precio actual de cada producto.
  const renglones = items.map((i) => ({ productoNombre: i.producto.nombre, cantidad: i.cantidad, precioUnitarioUSD: i.producto.costoUSD }));
  validarLineasDePago(input.lineas, "exacto", totalDeudas(renglones));

  const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
  if (!turnoAbierto) {
    throw new SinTurnoAbiertoError();
  }

  // Un carrito de un solo producto conserva el enlace al producto y la
  // cantidad; con varios, el Pago solo lleva el concepto ("Agua × 2, Gatorade").
  const unico = items.length === 1 ? items[0] : null;
  const concepto = conceptoDeudas(renglones);

  // Un pago combinado (2+ líneas) se correlaciona con grupoPagoId, igual
  // que en RegistrarPago.
  const grupoPagoId = input.lineas.length > 1 ? randomUUID() : null;

  const pagosCreados: Pago[] = [];
  for (const linea of input.lineas) {
    pagosCreados.push(
      await deps.pagos.crear({
        miembroId: null,
        sucursalId: input.sucursalId,
        turnoId: turnoAbierto.id,
        registradoPorId: input.registradoPorId,
        monto: linea.monto,
        metodo: linea.metodo,
        metodoPagoId: linea.metodoPagoId,
        numeroOperacion: linea.numeroOperacion,
        tasaCambio: linea.tasaCambio,
        montoBs: linea.tasaCambio !== null ? linea.monto * linea.tasaCambio : null,
        fechaInicioCiclo: null,
        fechaFinCiclo: null,
        grupoPagoId,
        productoId: unico ? unico.producto.id : null,
        productoNombre: unico ? unico.producto.nombre : concepto,
        cantidad: unico ? unico.cantidad : null,
      })
    );
  }

  return pagosCreados;
}
