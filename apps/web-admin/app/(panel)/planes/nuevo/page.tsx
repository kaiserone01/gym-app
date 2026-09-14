import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { obtenerSucursalesDeLaOrganizacion } from "../obtenerSucursales";
import { FormularioPlan } from "../FormularioPlan";
import { crearPlanAction } from "../actions";

export default async function PaginaNuevoPlan() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const sucursales = await obtenerSucursalesDeLaOrganizacion(usuario.organizacionId);

  return (
    <div className="max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-semibold">Nuevo plan</h1>
      <FormularioPlan accion={crearPlanAction} sucursales={sucursales} />
    </div>
  );
}
