import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { Button } from "@gym-app/ui/components/Button";
import { EstadoToggle } from "./EstadoToggle";
import { BotonImprimir } from "../BotonImprimir";

interface Filtros {
  nombre?: string;
  inscritoDesde?: string;
  venceHasta?: string;
}

export default async function PaginaMiembros({ searchParams }: { searchParams: Promise<Filtros> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const filtros = await searchParams;

  const todos = await listarMiembros({ miembros: new PrismaMemberRepository(prisma) }, usuario.organizacionId);

  const miembros = todos.filter((miembro) => {
    if (
      filtros.nombre &&
      !`${miembro.nombre} ${miembro.cedula}`.toLowerCase().includes(filtros.nombre.toLowerCase())
    ) {
      return false;
    }

    const inscripcion = miembro.fechaInscripcion ?? miembro.createdAt;
    if (filtros.inscritoDesde && inscripcion < new Date(`${filtros.inscritoDesde}T00:00:00`)) return false;

    if (filtros.venceHasta) {
      if (!miembro.fechaVencimiento || miembro.fechaVencimiento > new Date(`${filtros.venceHasta}T23:59:59`)) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Miembros</h1>
        <div className="flex gap-2">
          <BotonImprimir />
          <Link href="/miembros/nuevo">
            <Button>Nuevo miembro</Button>
          </Link>
        </div>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-4 print:hidden">
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Nombre o cédula
          <input
            type="text"
            name="nombre"
            defaultValue={filtros.nombre}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Inscritos desde
          <input
            type="date"
            name="inscritoDesde"
            defaultValue={filtros.inscritoDesde}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Vencidos hasta
          <input
            type="date"
            name="venceHasta"
            defaultValue={filtros.venceHasta}
            className="rounded border border-neutral-300 px-3 py-2"
          />
        </label>
        <Button type="submit">Filtrar</Button>
        <Link href="/miembros" className="text-sm text-neutral-500 hover:underline">
          Limpiar
        </Link>
      </form>

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
                Ningún miembro coincide con los filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
