import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { obtenerSucursalesVisiblesParaMiembro } from "../obtenerSucursalesVisibles";
import { obtenerEntrenadoresPorSucursal } from "../obtenerEntrenadoresPorSucursal";
import { FormularioMiembro } from "../FormularioMiembro";
import { crearMiembroAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import { obtenerTurnoAbiertoParaUsuario } from "../../caja/obtenerTurnoAbiertoParaUsuario";
import { AvisoCajaCerrada } from "../../caja/AvisoCajaCerrada";

export default async function PaginaNuevoMiembro() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const turnoAbierto = await obtenerTurnoAbiertoParaUsuario(usuario);

  // Inscribir un miembro es una operación de caja (ver diseño acordado:
  // hay que abrir turno antes de inscribir o cobrar) — en vez del
  // formulario se muestra el aviso con acceso directo a Abrir turno.
  if (!turnoAbierto) {
    return (
      <div className="max-w-4xl p-6 lg:p-8">
        <div className="mb-6">
          <PageHeader>Nuevo miembro</PageHeader>
        </div>
        <AvisoCajaCerrada mensaje="Para inscribir un miembro primero tenés que abrir la caja." />
      </div>
    );
  }

  const [planes, sucursales, sucursalesOrganizacion, metodosPago] = await Promise.all([
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    obtenerSucursalesVisiblesParaMiembro(usuario),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
  ]);
  const entrenadoresPorSucursal = await obtenerEntrenadoresPorSucursal(usuario.organizacionId, sucursales);

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Nuevo miembro</PageHeader>
      </div>
      <FormularioMiembro
        accion={crearMiembroAction}
        entrenadoresPorSucursal={entrenadoresPorSucursal}
        planes={planes}
        sucursales={sucursales}
        sucursalesOrganizacion={sucursalesOrganizacion}
        sucursalIdDefault={usuario.sucursalId}
        metodosPago={metodosPago}
        miembroId={null}
        ultimosCiclos={[]}
      />
    </div>
  );
}
