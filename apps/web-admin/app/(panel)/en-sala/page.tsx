import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { tienePermisoEnSala } from "@/lib/permisoEnSala";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { PanelEnSala } from "./PanelEnSala";

export default async function PaginaEnSala() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");

  if (!(await tienePermisoEnSala(sesion.usuario, "VER"))) redirect("/miembros");

  const sucursal = await new PrismaSucursalRepository(prisma).buscarPorId(
    sesion.usuario.organizacionId,
    sesion.sucursalActivaId
  );

  return (
    <div className="p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-semibold print:hidden" style={{ color: "var(--gx-ink)" }}>
        En sala
      </h1>
      <PanelEnSala esSocio={sesion.usuario.rol === "SOCIO"} sucursalNombre={sucursal?.nombre ?? "—"} />
    </div>
  );
}
