import { randomUUID } from "node:crypto";
import { IPagoRepository } from "../ports/IPagoRepository";
import { IProductoRepository } from "../ports/IProductoRepository";
import { ITurnoRepository } from "../ports/ITurnoRepository";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { Pago, DatosLineaPago, validarLineasDePago } from "../entities/Pago";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Tu rol no tiene permiso para vender productos.");
  }
}

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
  productoId: string;
  cantidad: number;
  lineas: DatosLineaPago[];
  sucursalId: string;
  registradoPorId: string;
}

export async function venderProducto(deps: VenderProductoDeps, input: DatosVenderProducto): Promise<Pago[]> {
  if (!(await deps.autorizacion.tienePermiso(input.registradoPorId, "CAJA", "CREAR"))) {
    throw new RolNoAutorizadoError();
  }

  if (!Number.isInteger(input.cantidad) || input.cantidad < 1) {
    throw new CantidadInvalidaError();
  }

  const producto = await deps.productos.buscarPorId(input.organizacionId, input.productoId);
  if (!producto) {
    throw new ProductoNoEncontradoError();
  }
  if (!producto.activo) {
    throw new ProductoInactivoError();
  }

  const totalACobrar = Math.round(producto.costoUSD * input.cantidad * 100) / 100;
  validarLineasDePago(input.lineas, "exacto", totalACobrar);

  const turnoAbierto = await deps.turnos.buscarAbiertoPorSucursal(input.sucursalId);
  if (!turnoAbierto) {
    throw new SinTurnoAbiertoError();
  }

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
        productoId: producto.id,
        productoNombre: producto.nombre,
        cantidad: input.cantidad,
      })
    );
  }

  return pagosCreados;
}
