import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { FormularioMetodoPago } from "../FormularioMetodoPago";
import { crearMetodoPagoAction } from "../../actions";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaNuevoMetodoPago() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <PageHeader>Nuevo método de pago</PageHeader>
      </div>
      <FormularioMetodoPago accion={crearMetodoPagoAction} />
    </div>
  );
}
