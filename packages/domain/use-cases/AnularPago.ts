import { IPagoRepository } from "../ports/IPagoRepository";
import { Pago } from "../entities/Pago";
import { RolUsuario } from "../entities/UsuarioAdmin";

export class RolNoAutorizadoError extends Error {
  constructor() {
    super("Solo el dueño o un gerente pueden anular un pago.");
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
  pagoId: string;
  anuladoPorId: string;
  rolAnulador: RolUsuario;
  motivo: string;
}

export async function anularPago(
  deps: { pagos: IPagoRepository },
  input: DatosAnularPago
): Promise<Pago> {
  if (input.rolAnulador !== "DUENO" && input.rolAnulador !== "GERENTE") {
    throw new RolNoAutorizadoError();
  }

  if (!input.motivo.trim()) {
    throw new MotivoRequeridoError();
  }

  const pago = await deps.pagos.buscarPorId(input.pagoId);
  if (!pago) {
    throw new PagoNoEncontradoError();
  }
  if (pago.anuladoEn) {
    throw new PagoYaAnuladoError();
  }

  return deps.pagos.anular(input.pagoId, input.anuladoPorId, input.motivo.trim(), new Date());
}
