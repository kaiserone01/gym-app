import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMiembroReferenciaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMiembroReferenciaRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { ExcelGrid } from "./ExcelGrid";
import { aFilaGrid, HOJA_POR_DEFECTO } from "./tiposGrid";

export default async function PaginaExcel() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const repo = new PrismaMiembroReferenciaRepository(prisma);
  const autorizacion = new AuthorizationService(new PrismaPermisoRepository(prisma));
  if (
    !(await repo.existeParaSucursal(usuario.organizacionId, sucursalActivaId)) ||
    !(await autorizacion.tienePermiso(usuario.id, "MIEMBROS", "VER"))
  ) {
    redirect("/configuraciones");
  }
  const puedeEditar = await autorizacion.tienePermiso(usuario.id, "MIEMBROS", "EDITAR");

  const [referencias, hoja] = await Promise.all([
    repo.listarTodas(usuario.organizacionId, sucursalActivaId),
    repo.obtenerHoja(usuario.organizacionId, sucursalActivaId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        Espejo del archivo con sus filas reales; las filas de quien aún no es miembro se pueden corregir y resaltar
      </p>
      <ExcelGrid filas={referencias.map((r) => aFilaGrid(r, r.miembroId))} hoja={hoja ?? HOJA_POR_DEFECTO} puedeEditar={puedeEditar} />
    </div>
  );
}
