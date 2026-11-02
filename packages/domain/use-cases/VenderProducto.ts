import { randomUUID } from "node:crypto";
import { IPagoRepository } from "../ports/IPagoRepository";
import { IProductoRepository } from "../ports/IProductoRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { ITasaCambioRepository } from "../ports/ITasaCambioRepository";
import { Pago, DatosLineaPago, validarLineasDePago } from "../entities/Pago";
import { resolverCobroPasado, tasaDeLinea } from "./resolverCobroPasado";
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
  // Solo para ventas con fecha pasada: tasa BCV de ese día.
  tasas?: ITasaCambioRepository;
}

export interface DatosVenderProducto {
  organizacionId: string;
  items: ItemCarrito[];
  lineas: DatosLineaPago[];
  sucursalId: string;
  registradoPorId: string;
  // Venta que ya se hizo y cobró en un día pasado (hasta MAX_DIAS_ATRAS_PAGO_FECHADO) y no se registró: queda fuera de
  // turno (no toca el arqueo de hoy) y los Bs usan la tasa BCV de ese día. De hoy se ignora.
  fechaVenta?: Date;
}

export async function venderProducto(deps: VenderProductoDeps, input: DatosVenderProducto): Promise<Pago[]> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  const items = await resolverItemsVenta(deps.productos, input.organizacionId, input.items);

  // El total lo calcula el servidor con el precio actual de cada producto.
  const renglones = items.map((i) => ({ productoNombre: i.producto.nombre, cantidad: i.cantidad, precioUnitarioUSD: i.producto.costoUSD }));
  validarLineasDePago(input.lineas, "exacto", totalDeudas(renglones));

  const pasado = await resolverCobroPasado(deps.tasas, input.fechaVenta, input.lineas);
  let turnoId: string | null = null;
  if (!pasado) {
    const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
    if (!turnoAbierto) {
      throw new SinTurnoAbiertoError();
    }
    turnoId = turnoAbierto.id;
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
    const tasaCambio = tasaDeLinea(linea, pasado);
    pagosCreados.push(
      await deps.pagos.crear({
        miembroId: null,
        sucursalId: input.sucursalId,
        turnoId,
        registradoPorId: input.registradoPorId,
        monto: linea.monto,
        metodo: linea.metodo,
        metodoPagoId: linea.metodoPagoId,
        numeroOperacion: linea.numeroOperacion,
        tasaCambio,
        montoBs: tasaCambio !== null ? linea.monto * tasaCambio : null,
        fechaInicioCiclo: null,
        fechaFinCiclo: null,
        grupoPagoId,
        productoId: unico ? unico.producto.id : null,
        productoNombre: unico ? unico.producto.nombre : concepto,
        cantidad: unico ? unico.cantidad : null,
        ...(pasado ? { fechaPago: pasado.fecha } : {}),
      })
    );
  }

  return pagosCreados;
}
