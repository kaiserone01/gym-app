import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { FormularioMiembro } from "../FormularioMiembro";
import { crearMiembroAction } from "../actions";

export default async function PaginaNuevoMiembro() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  return (
    <div className="max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Nuevo miembro</h1>
      <FormularioMiembro accion={crearMiembroAction} />
    </div>
  );
}
