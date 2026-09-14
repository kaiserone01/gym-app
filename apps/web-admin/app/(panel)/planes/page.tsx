import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";

const ETIQUETA_TIPO_ACCESO: Record<string, string> = {
  TODA_LA_ORGANIZACION: "Toda la organización",
  SEDE_UNICA: "Sede única",
  LISTA_CERRADA: "Lista cerrada",
};

export default async function PaginaPlanes() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const planes = await listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Planes</h1>
        <Link href="/planes/nuevo">
          <Button>Nuevo plan</Button>
        </Link>
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Nombre</th>
            <th className="py-2">Tipo de acceso</th>
            <th className="py-2">Precio (USD)</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {planes.map((plan) => (
            <tr key={plan.id} className="border-b">
              <td className="py-2">{plan.nombre}</td>
              <td className="py-2">{ETIQUETA_TIPO_ACCESO[plan.tipoAcceso]}</td>
              <td className="py-2">${plan.precioUSD.toFixed(2)}</td>
              <td className="py-2">
                <Badge tono={plan.activo ? "verde" : "gris"}>{plan.activo ? "Activo" : "Inactivo"}</Badge>
              </td>
              <td className="py-2">
                <Link href={`/planes/${plan.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  Editar
                </Link>
              </td>
            </tr>
          ))}

          {planes.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-neutral-500">
                Todavía no hay planes. Creá el primero.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
