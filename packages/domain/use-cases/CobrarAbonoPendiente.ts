import { IMemberRepository } from "../ports/IMemberRepository";
import { IPlanRepository } from "../ports/IPlanRepository";
import { Pago } from "../entities/Pago";
import { totalDeudas } from "../entities/DeudaProducto";
import { RolUsuario } from "../entities/UsuarioAdmin";
import { calcularAbonosPendientes } from "./ListarAbonosPendientes";
import { registrarPagoConDeudas, RegistrarPagoConDeudasDeps } from "./RegistrarPagoConDeudas";
import { MiembroNoEncontradoError } from "./ActualizarMiembro";
import { DatosLineaPago } from "./RegistrarPago";

export class SinAbonoPendienteError extends Error {
  constructor() {
    super("Este miembro no tiene saldo de membresía pendiente.");
  }
}

export class MontoNoCoincideConLoPendienteError extends Error {
  constructor(esperadoUSD: number) {
    super(`El pago debe ser exactamente $${esperadoUSD.toFixed(2)} (saldo de la membresía más los productos pendientes).`);
  }
}

// Cobra el saldo pendiente de la membresía del miembro (y, si tiene, sus productos fiados) en UN solo pago.
// El saldo lo calcula el servidor; el cliente solo manda las líneas, que deben sumar exactamente lo pendiente.
// Debe correr dentro de una transacción (ver cobrarDeudasAction).
export async function cobrarAbonoPendiente(
  deps: RegistrarPagoConDeudasDeps & { miembros: IMemberRepository; planes: IPlanRepository },
  input: {
    organizacionId: string;
    miembroId: string;
    lineas: DatosLineaPago[];
    sucursalId: string;
    registradoPorId: string;
    rolUsuario: RolUsuario;
  }
): Promise<Pago[]> {
  const miembro = await deps.miembros.buscarPorId(input.organizacionId, input.miembroId);
  if (!miembro) throw new MiembroNoEncontradoError();
  const plan = miembro.planId ? await deps.planes.buscarPorId(input.organizacionId, miembro.planId) : null;
  if (!miembro.planId || !plan) throw new SinAbonoPendienteError();

  const ahora = new Date();
  const pagosDelMiembro = (await deps.pagos.listarPorMiembro(input.miembroId)).filter(
    (p) => p.fechaFinCiclo !== null && p.fechaFinCiclo > ahora
  );
  const [abono] = calcularAbonosPendientes([miembro], [plan], pagosDelMiembro, ahora);
  if (!abono) throw new SinAbonoPendienteError();

  const deudas = await deps.deudas.listarPendientesPorMiembro(input.organizacionId, input.miembroId, input.sucursalId);
  const esperado = Math.round((abono.saldoUSD + totalDeudas(deudas)) * 100) / 100;
  if (Math.abs(input.lineas.reduce((suma, linea) => suma + linea.monto, 0) - esperado) >= 0.01) {
    throw new MontoNoCoincideConLoPendienteError(esperado);
  }

  return registrarPagoConDeudas(deps, {
    organizacionId: input.organizacionId,
    miembroId: input.miembroId,
    planId: miembro.planId,
    lineas: input.lineas,
    sucursalId: input.sucursalId,
    registradoPorId: input.registradoPorId,
    rolUsuario: input.rolUsuario,
    incluirDeudas: deudas.length > 0,
  });
}
