import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";

export default async function Home() {
  const sesion = await obtenerUsuarioDeSesionActual();
  redirect(sesion ? "/miembros" : "/login");
}
