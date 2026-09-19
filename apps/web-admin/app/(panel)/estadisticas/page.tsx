import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { PrismaCheckInRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCheckInRepository";
import { obtenerEstadisticasCheckIn } from "@gym-app/domain/use-cases/ObtenerEstadisticasCheckIn";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";

function formatoFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export default async function PaginaEstadisticas({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const esDueno = usuario.rol === "DUENO";
  const permisos = new PrismaPermisoRepository(prisma);
  const puedeVer = esDueno || (await permisos.tiene(usuario.id, "SUCURSALES", "VER"));
  if (!puedeVer) redirect("/miembros");

  const { desde: desdeParam, hasta: hastaParam } = await searchParams;

  const hastaDefault = new Date();
  const desdeDefault = new Date(hastaDefault);
  desdeDefault.setDate(desdeDefault.getDate() - 30);

  const desde = desdeParam ? new Date(`${desdeParam}T00:00:00`) : desdeDefault;
  const hasta = hastaParam ? new Date(`${hastaParam}T23:59:59`) : hastaDefault;

  const estadisticas = await obtenerEstadisticasCheckIn(
    { checkIns: new PrismaCheckInRepository(prisma) },
    { organizacionId: usuario.organizacionId, desde, hasta }
  );

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-semibold">Estadísticas de check-in</h1>

      <form method="get" className="mb-6 flex items-end gap-4">
        <Input name="desde" label="Desde" type="date" defaultValue={formatoFecha(desde)} />
        <Input name="hasta" label="Hasta" type="date" defaultValue={formatoFecha(hasta)} />
        <Button type="submit">Filtrar</Button>
      </form>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Sucursal</th>
            <th className="py-2">Check-ins</th>
          </tr>
        </thead>
        <tbody>
          {estadisticas.map((estadistica) => (
            <tr key={estadistica.sucursalId} className="border-b">
              <td className="py-2">{estadistica.nombreSucursal}</td>
              <td className="py-2">{estadistica.cantidad}</td>
            </tr>
          ))}

          {estadisticas.length === 0 && (
            <tr>
              <td colSpan={2} className="py-8 text-center text-neutral-500">
                Todavía no hay sucursales.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
