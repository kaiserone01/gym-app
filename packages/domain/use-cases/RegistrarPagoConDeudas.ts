import { IDeudaProductoRepository } from "../ports/IDeudaProductoRepository";
import { Pago, repartirLineasPago, MontoNoCubreDeudaError } from "../entities/Pago";
import { totalDeudas } from "../entities/DeudaProducto";
import { registrarPago, RegistrarPagoDeps, DatosRegistrarPago } from "./RegistrarPago";
import { cobrarDeudasMiembro } from "./CobrarDeudasMiembro";

export { MontoNoCubreDeudaError };

export interface RegistrarPagoConDeudasDeps extends RegistrarPagoDeps {
  deudas: IDeudaProductoRepository;
}

export interface DatosRegistrarPagoConDeudas extends DatosRegistrarPago {
  incluirDeudas: boolean;
}

// Paga la membresía y, opcionalmente, los productos fiados del miembro en un
// mismo cobro. Las líneas traen el total (membresía + deuda): la deuda se
// descuenta primero, en orden, y lo que sobra es el pago de la membresía, que
// sigue todas sus reglas de siempre (abono, mínimo, ciclo). Devuelve los Pago
// de la membresía. Debe correr dentro de una transacción (ver
// registrarPagoAction): si la membresía falla, las deudas no quedan cobradas.
export async function registrarPagoConDeudas(
  deps: RegistrarPagoConDeudasDeps,
  input: DatosRegistrarPagoConDeudas
): Promise<Pago[]> {
  const { incluirDeudas, ...datosPago } = input;
  if (!incluirDeudas) {
    return registrarPago(deps, datosPago);
  }

  const deudas = await deps.deudas.listarPendientesPorMiembro(input.organizacionId, input.miembroId, input.sucursalId);
  if (deudas.length === 0) {
    return registrarPago(deps, datosPago);
  }

  // El monto de la deuda lo calcula el servidor; el cliente solo manda el total.
  const [lineasDeuda, lineasMembresia] = repartirLineasPago(input.lineas, totalDeudas(deudas));
  if (lineasMembresia.length === 0) {
    throw new MontoNoCubreDeudaError();
  }

  await cobrarDeudasMiembro(
    { deudas: deps.deudas, pagos: deps.pagos, turnos: deps.turnos, autorizacion: deps.autorizacion },
    {
      organizacionId: input.organizacionId,
      miembroId: input.miembroId,
      lineas: lineasDeuda,
      sucursalId: input.sucursalId,
      registradoPorId: input.registradoPorId,
    }
  );

  return registrarPago(deps, { ...datosPago, lineas: lineasMembresia });
}
