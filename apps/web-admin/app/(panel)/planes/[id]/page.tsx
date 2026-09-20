import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { obtenerSucursalesDeLaOrganizacion } from "../obtenerSucursales";
import { FormularioPlan } from "../FormularioPlan";
import { actualizarPlanAction, darDeBajaPlanAction, reactivarPlanAction } from "../actions";
import { Button } from "@gym-app/ui/components/Button";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaEditarPlan({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const { id } = await params;

  const plan = await new PrismaPlanRepository(prisma).buscarPorId(usuario.organizacionId, id);
  if (!plan) notFound();

  const [sucursales, accesos] = await Promise.all([
    obtenerSucursalesDeLaOrganizacion(usuario.organizacionId),
    prisma.planSucursalAcceso.findMany({ where: { planId: id }, select: { sucursalId: true } }),
  ]);

  const idsAsignados = new Set(accesos.map((a) => a.sucursalId));
  const sucursalesAsignadas = sucursales.filter((s) => idsAsignados.has(s.id));

  return (
    <div className="max-w-lg p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Editar plan</PageHeader>
      </div>

      <FormularioPlan
        accion={actualizarPlanAction.bind(null, id)}
        sucursales={sucursales}
        valoresIniciales={{
          nombre: plan.nombre,
          tipoAcceso: plan.tipoAcceso,
          precioUSD: plan.precioUSD,
          sucursalesAsignadas,
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
