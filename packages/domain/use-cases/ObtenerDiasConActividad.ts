import { ITurnoRepository } from "../ports/ITurnoRepository";

export async function obtenerDiasConActividad(
  deps: { turnos: ITurnoRepository },
  organizacionId: string
): Promise<Date[]> {
  return deps.turnos.listarFechasConTurno(organizacionId);
}
