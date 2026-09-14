import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { Button } from "@gym-app/ui/components/Button";
import { EstadoToggle } from "./EstadoToggle";

export default async function PaginaMiembros() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const miembros = await listarMiembros(
    { miembros: new PrismaMemberRepository(prisma) },
    usuario.organizacionId
  );

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Miembros</h1>
        <Link href="/miembros/nuevo">
          <Button>Nuevo miembro</Button>
        </Link>
      </div>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b text-sm text-neutral-500">
            <th className="py-2">Nombre</th>
            <th className="py-2">Cédula</th>
            <th className="py-2">Plan</th>
            <th className="py-2">Vence</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {miembros.map((miembro) => (
            <tr key={miembro.id} className="border-b">
              <td className="py-2">{miembro.nombre}</td>
              <td className="py-2">{miembro.cedula}</td>
              <td className="py-2">
                {miembro.planTipo === "CON_ENTRENADOR" ? "Con entrenador" : "Sin entrenador"}
              </td>
              <td className="py-2">
                {miembro.fechaVencimiento
                  ? new Date(miembro.fechaVencimiento).toLocaleDateString("es-VE")
                  : "—"}
              </td>
              <td className="py-2">
                <EstadoToggle id={miembro.id} activo={miembro.activo} />
              </td>
              <td className="py-2">
                <Link href={`/miembros/${miembro.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  Editar
                </Link>
              </td>
            </tr>
          ))}

          {miembros.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-neutral-500">
                Todavía no hay miembros. Creá el primero.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
