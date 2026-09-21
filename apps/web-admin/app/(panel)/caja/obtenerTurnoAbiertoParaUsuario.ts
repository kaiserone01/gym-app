import { prisma } from "@/lib/prisma";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import type { Turno } from "@gym-app/domain/entities/Turno";

// El turno abierto de la sucursal ACTIVA de esta sesión (ver
// sucursalActivaId, plan de selección de sucursal al iniciar sesión), con
// una bandera explícita de si es SUYO (turno.usuarioId === usuarioId) o de
// otra persona (ver caso de uso: un solo usuario a la vez por caja).
// Antes esta función recibía el UsuarioAdmin completo y ramificaba entre
// "tiene sucursalId fijo -> buscar ahí" vs "no tiene (SOCIO) -> buscar
// entre TODAS las sucursales visibles" — con sucursalActivaId siempre hay
// exactamente una sucursal conocida de antemano (elegida al loguearse),
// así que no hace falta esa rama ni conocer las sucursales visibles acá.
export interface TurnoAbiertoParaUsuario {
  turno: Turno;
  esPropio: boolean;
}

export async function obtenerTurnoAbiertoParaUsuario(
  sucursalActivaId: string,
  usuarioId: string
): Promise<TurnoAbiertoParaUsuario | null> {
  const turnoRepo = new PrismaTurnoRepository(prisma);
  const turno = await turnoRepo.buscarAbiertoPorSucursal(sucursalActivaId);

  if (!turno) return null;

  return { turno, esPropio: turno.usuarioId === usuarioId };
}
