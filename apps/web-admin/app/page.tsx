import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { tienePermisoEnSala } from "@/lib/permisoEnSala";

// Pantalla de aterrizaje: "En sala" para quien puede verla, si no Miembros.
export default async function Home() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  redirect((await tienePermisoEnSala(sesion.usuario, "VER")) ? "/en-sala" : "/miembros");
}
