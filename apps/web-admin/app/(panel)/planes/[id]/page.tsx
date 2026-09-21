import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { contarImpactoCambioPlan } from "@gym-app/domain/use-cases/ContarImpactoCambioPlan";
import { FormularioPlan } from "../FormularioPlan";
import { actualizarPlanAction, actualizarFrecuenciaPlanAction, darDeBajaPlanAction, reactivarPlanAction } from "../actions";
import { Button } from "@gym-app/ui/components/Button";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaEditarPlan({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const { id } = await params;

  const planRepo = new PrismaPlanRepository(prisma);
  const plan = await planRepo.buscarPorId(usuario.organizacionId, id);
  if (!plan) notFound();

  const cantidadSuscripcionesActivas = await contarImpactoCambioPlan({ planes: planRepo }, id);

  return (
    <div className="max-w-lg p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Editar plan</PageHeader>
      </div>

      <FormularioPlan
        accion={actualizarPlanAction.bind(null, id)}
        valoresIniciales={{
          nombre: plan.nombre,
          frecuencia: plan.frecuencia,
          incluyeEntrenador: plan.incluyeEntrenador,
          precioUSD: plan.precioUSD,
          multisede: plan.multisede,
        }}
        cambioFrecuencia={{
          accion: actualizarFrecuenciaPlanAction.bind(null, id),
          puedeEditar: usuario.rol === "SOCIO",
          cantidadSuscripcionesActivas,
        }}
      />

      {plan.activo ? (
        <form action={darDeBajaPlanAction.bind(null, id)} className="mt-6">
          <Button variant="peligro" type="submit">
            Dar de baja
          </Button>
        </form>
      ) : (
        <form action={reactivarPlanAction.bind(null, id)} className="mt-6">
          <Button variant="secundario" type="submit">
            Reactivar
          </Button>
        </form>
      )}
    </div>
  );
}
