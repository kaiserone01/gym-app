import { prisma } from "@/lib/prisma";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import type { Turno } from "@gym-app/domain/entities/Turno";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";
import { obtenerSucursalesVisiblesParaTurno } from "./obtenerSucursalesVisiblesParaTurno";

// El turno abierto visible para este usuario, con una bandera explícita de
// si es SUYO (turno.usuarioId === usuario.id) o de otra persona. Antes esta
// función devolvía el turno abierto de la sucursal sin esa distinción: un
// SOCIO (ve todas las sucursales) terminaba "usando" como propio el turno
// que otro usuario tenía abierto, pudiendo registrar pagos/egresos/cerrar
// una caja que no era suya (ver caso de uso: un solo usuario a la vez por
// caja). Gerente/Recepción tienen sucursalId fijo: basta buscar ahí, y ahí
// el turno encontrado siempre es de ellos mismos (regla de "una caja
// abierta por sucursal" a nivel de datos, ver TurnoYaAbiertoError)  salvo
// que hayan dos usuarios con la misma sucursalId fija, caso cubierto igual
// por la comparación de usuarioId. Un SOCIO no tiene sucursalId fijo — hay
// que buscar entre todas las que puede ver.
export interface TurnoAbiertoParaUsuario {
  turno: Turno;
  esPropio: boolean;
}

export async function obtenerTurnoAbiertoParaUsuario(
  usuario: UsuarioAdmin
): Promise<TurnoAbiertoParaUsuario | null> {
  const turnoRepo = new PrismaTurnoRepository(prisma);

  const turno = usuario.sucursalId
    ? await turnoRepo.buscarAbiertoPorSucursal(usuario.sucursalId)
    : await turnoRepo.buscarAbiertoEntreSucursales(
        (await obtenerSucursalesVisiblesParaTurno(usuario)).map((s) => s.id)
      );

  if (!turno) return null;

  return { turno, esPropio: turno.usuarioId === usuario.id };
}
