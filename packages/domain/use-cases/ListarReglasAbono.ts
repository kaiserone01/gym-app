import { IReglaAbonoRepository } from "../ports/IReglaAbonoRepository";
import { ReglaAbonoPorFrecuencia } from "../entities/ReglaAbono";

export async function listarReglasAbono(
  deps: { reglasAbono: IReglaAbonoRepository },
  organizacionId: string
): Promise<ReglaAbonoPorFrecuencia[]> {
  return deps.reglasAbono.listarPorOrganizacion(organizacionId);
}
