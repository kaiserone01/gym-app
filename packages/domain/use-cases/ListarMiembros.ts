import { IMemberRepository } from "../ports/IMemberRepository";
import { Miembro } from "../entities/Miembro";

export async function listarMiembros(
  deps: { miembros: IMemberRepository },
  organizacionId: string
): Promise<Miembro[]> {
  return deps.miembros.listarPorOrganizacion(organizacionId);
}
