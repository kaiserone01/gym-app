import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaMiembroReferenciaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { Button } from "@gym-app/ui/components/Button";
import { ListaMiembros } from "./ListaMiembros";
import { ActivarDesdeExcel } from "./ActivarDesdeExcel";
import { obtenerTurnoAbiertoParaUsuario } from "../caja/obtenerTurnoAbiertoParaUsuario";
import { AvisoCajaCerrada } from "../caja/AvisoCajaCerrada";

export default async function PaginaMiembros() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const [miembros, planes, sucursales, turnoAbierto] = await Promise.all([
    listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId, sucursalActivaId),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
    obtenerTurnoAbiertoParaUsuario(sucursalActivaId, usuario.id),
  ]);

  const puedeActivarDesdeExcel =
    (await new PrismaMiembroReferenciaRepository(prisma).existeParaSucursal(usuario.organizacionId, sucursalActivaId)) &&
    (await new AuthorizationService(new PrismaPermisoRepository(prisma)).tienePermiso(usuario.id, "MIEMBROS", "CREAR"));

  // Inscribir un miembro es una operación de caja — el alta queda atada a
  // un turno para el cuadre (ver diseño acordado: hay que abrir caja antes
  // de inscribir o cobrar). Se renderiza dentro de ListaMiembros, junto al
  // título y el toggle Cards/Lista (ver diseño acordado).
  const botonNuevoMiembro = turnoAbierto?.esPropio ? (
    <Link href="/miembros/nuevo">
      <Button>Nuevo miembro</Button>
    </Link>
  ) : (
    <Button
      disabled
      title={
        turnoAbierto
          ? `La caja la tiene abierta ${turnoAbierto.turno.usuarioNombre ?? "otro usuario"}`
          : "Abrí la caja para poder inscribir un miembro"
      }
    >
      Nuevo miembro
    </Button>
  );

  return (
    <div className="p-6 lg:p-8">
      {!turnoAbierto?.esPropio && (
        <div className="mb-6 print:hidden">
          <AvisoCajaCerrada
            mensaje={
              turnoAbierto
                ? `No puedes inscribir miembros ni registrar pagos: la caja está abierta por ${turnoAbierto.turno.usuarioNombre ?? "otro usuario"}.`
                : undefined
            }
          />
        </div>
      )}

      {puedeActivarDesdeExcel && <ActivarDesdeExcel />}

      <ListaMiembros miembros={miembros} planes={planes} sucursales={sucursales} accionesHeader={botonNuevoMiembro} />
    </div>
  );
}
