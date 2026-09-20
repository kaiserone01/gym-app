import { IMetodoPagoRepository } from "../ports/IMetodoPagoRepository";
import { MetodoPago, DatosNuevoMetodoPago } from "../entities/MetodoPago";

export async function crearMetodoPago(
  deps: { metodosPago: IMetodoPagoRepository },
  input: DatosNuevoMetodoPago
): Promise<MetodoPago> {
  return deps.metodosPago.crear(input);
}
