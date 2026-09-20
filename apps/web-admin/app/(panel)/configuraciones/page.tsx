import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";

export default async function PaginaConfiguraciones() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  redirect("/configuraciones/metodos-pago");
}
