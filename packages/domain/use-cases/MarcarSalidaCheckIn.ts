import { ICheckInRepository } from "../ports/ICheckInRepository";
import { inicioDelDiaCaracas } from "../utils/fechaCaracas";

export async function marcarSalidaCheckIn(
  deps: { checkIns: ICheckInRepository },
  input: { sucursalId: string; miembroId: string; ahora?: Date }
): Promise<void> {
  const ahora = input.ahora ?? new Date();
  await deps.checkIns.marcarSalida(input.sucursalId, input.miembroId, inicioDelDiaCaracas(ahora), ahora);
}
