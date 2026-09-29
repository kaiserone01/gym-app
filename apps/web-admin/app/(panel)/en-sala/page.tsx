import { redirect } from "next/navigation";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { tienePermisoEnSala } from "@/lib/permisoEnSala";
import { ListaEnSala } from "./ListaEnSala";

export default async function PaginaEnSala() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");

  if (!(await tienePermisoEnSala(sesion.usuario, "VER"))) redirect("/miembros");
  const puedeMarcarSalida = await tienePermisoEnSala(sesion.usuario, "EDITAR");

  return (
    <div className="p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-semibold" style={{ color: "var(--gx-ink)" }}>
        En sala
      </h1>
      <ListaEnSala puedeMarcarSalida={puedeMarcarSalida} />
    </div>
  );
}
