import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { listarMetodosPagoActivos } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { listarSucursales } from "@gym-app/domain/use-cases/ListarSucursales";
import { obtenerSucursalesVisiblesParaMiembro } from "../../miembros/obtenerSucursalesVisibles";
import { FormularioPago } from "../FormularioPago";
import { registrarPagoAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaNuevoPago() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const [miembros, planes, metodosPago, sucursalesVisibles, sucursalesOrganizacion] = await Promise.all([
    listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId, sucursalActivaId),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
    listarMetodosPagoActivos({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId),
    obtenerSucursalesVisiblesParaMiembro(usuario),
    listarSucursales({ sucursales: new PrismaSucursalRepository(prisma) }, usuario.organizacionId),
  ]);

  const planesActivos = planes.filter((plan) => plan.activo);
  const miembrosActivos = miembros.filter((m) => m.activo);

  return (
    <div className="max-w-lg p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Registrar pago</PageHeader>
      </div>
      <FormularioPago
        accion={registrarPagoAction}
        miembros={miembrosActivos}
        planes={planesActivos}
        metodosPago={metodosPago}
        sucursalesVisibles={sucursalesVisibles}
        sucursalesOrganizacion={sucursalesOrganizacion}
        sucursalIdDefault={sucursalActivaId}
      />
    </div>
  );
}
