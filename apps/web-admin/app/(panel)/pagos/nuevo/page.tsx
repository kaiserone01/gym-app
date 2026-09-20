import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { FormularioPago } from "../FormularioPago";
import { registrarPagoAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaNuevoPago() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const [miembros, planes] = await Promise.all([
    listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId),
    listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId),
  ]);

  const planesActivos = planes.filter((plan) => plan.activo);
  const miembrosActivos = miembros.filter((m) => m.activo);

  return (
    <div className="max-w-lg p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Registrar pago</PageHeader>
      </div>
      <FormularioPago accion={registrarPagoAction} miembros={miembrosActivos} planes={planesActivos} />
    </div>
  );
}
