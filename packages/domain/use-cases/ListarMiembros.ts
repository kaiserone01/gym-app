import { IMemberRepository } from "../ports/IMemberRepository";
import { Miembro } from "../entities/Miembro";

export async function listarMiembros(
  deps: { miembros: IMemberRepository },
  organizacionId: string,
  sucursalActivaId: string
): Promise<Miembro[]> {
  const todos = await deps.miembros.listarPorOrganizacion(organizacionId);
  return todos.filter((m) => m.sucursalId === null || m.sucursalId === sucursalActivaId);
}
