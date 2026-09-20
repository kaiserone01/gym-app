import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { FormularioPlan } from "../FormularioPlan";
import { crearPlanAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaNuevoPlan() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  return (
    <div className="max-w-lg p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Nuevo plan</PageHeader>
      </div>
      <FormularioPlan accion={crearPlanAction} />
    </div>
  );
}
