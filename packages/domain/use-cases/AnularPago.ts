import { IPagoRepository } from "../ports/IPagoRepository";
import { Pago } from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { IAuthorizationService } from "../ports/IAuthorizationService";
import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el socio o un gerente pueden anular un pago.");
  }
}

export class PagoNoEncontradoError extends Error {
  constructor() {
    super("No se encontró el pago.");
  }
}

export class PagoYaAnuladoError extends Error {
  constructor() {
    super("Este pago ya fue anulado.");
  }
}

export class MotivoRequeridoError extends Error {
  constructor() {
    super("El motivo de la anulación es requerido.");
  }
}

export interface DatosAnularPago {
  organizacionId: string;
  pagoId: string;
  anuladoPorId: string;
  rolAnulador: RolUsuario;
  motivo: string;
}

export async function anularPago(
  deps: { pagos: IPagoRepository; deudas: IDeudaProductoRepository; autorizacion: IAuthorizationService },
  input: DatosAnularPago
): Promise<Pago> {
  if (!(await deps.autorizacion.tienePermiso(input.anuladoPorId, "PAGOS", "ELIMINAR"))) {
    throw new RolNoAutorizadoError();
  }

  if (!input.motivo.trim()) {
    throw new MotivoRequeridoError();
  }

  const pago = await deps.pagos.buscarPorId(input.organizacionId, input.pagoId);
  if (!pago) {
    throw new PagoNoEncontradoError();
  }
  if (pago.anuladoEn) {
    throw new PagoYaAnuladoError();
  }

  const anulado = await deps.pagos.anular(input.organizacionId, input.pagoId, input.anuladoPorId, input.motivo.trim(), new Date());

  // Si este Pago era (parte de) el cobro de deudas de productos fiados y ya
  // no queda ninguna línea vigente de ese cobro, las deudas vuelven a estar
  // pendientes: si no, el dinero salió del turno y la deuda desaparecería.
  if (pago.grupoPagoId && (await deps.pagos.contarVigentesPorGrupo(input.organizacionId, pago.grupoPagoId)) === 0) {
    await deps.deudas.reabrirPorGrupo(pago.grupoPagoId);
  }

  return anulado;
}
