import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";

export default async function Home() {
  const usuario = await obtenerUsuarioDeSesionActual();
  redirect(usuario ? "/miembros" : "/login");
}
