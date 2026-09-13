import { ISesionRepository } from "../ports/ISesionRepository";

export interface CerrarSesionDeps {
  sesiones: ISesionRepository;
}

export async function cerrarSesion(deps: CerrarSesionDeps, token: string): Promise<void> {
  await deps.sesiones.eliminarPorToken(token);
}
