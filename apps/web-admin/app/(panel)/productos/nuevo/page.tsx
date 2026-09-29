import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { obtenerTasaActual } from "../tasaActual";
import { FormularioProducto } from "../FormularioProducto";
import { crearProductoAction } from "../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaNuevoProducto() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");

  return (
    <div className="max-w-lg p-6 lg:p-8">
      <div className="mb-6">
        <PageHeader>Nuevo producto</PageHeader>
      </div>
      <FormularioProducto accion={crearProductoAction} tasaActual={await obtenerTasaActual()} />
    </div>
  );
}
