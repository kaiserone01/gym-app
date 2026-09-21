import { prisma } from "@/lib/prisma";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import type { Turno } from "@gym-app/domain/entities/Turno";
import type { UsuarioAdmin } from "@gym-app/domain/entities/UsuarioAdmin";
import { obtenerSucursalesVisiblesParaTurno } from "./obtenerSucursalesVisiblesParaTurno";

// El turno abierto (si existe) para este usuario, sin importar en cuál de
// sus sucursales visibles esté — extraído de caja/page.tsx para
// reutilizarse en Miembros (no se puede inscribir ni cobrar sin turno
// abierto, ver diseño acordado). Gerente/Recepción tienen sucursalId fijo:
// basta buscar ahí. Un SOCIO no lo tiene (ve varias sucursales) — hay que
// buscar entre todas las que puede ver (mismo fix que el bug de /caja
// donde la página no encontraba el turno recién abierto).
export async function obtenerTurnoAbiertoParaUsuario(usuario: UsuarioAdmin): Promise<Turno | null> {
  const turnoRepo = new PrismaTurnoRepository(prisma);

  return usuario.sucursalId
    ? turnoRepo.buscarAbiertoPorSucursal(usuario.sucursalId)
    : turnoRepo.buscarAbiertoEntreSucursales(
        (await obtenerSucursalesVisiblesParaTurno(usuario)).map((s) => s.id)
      );
}
