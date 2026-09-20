import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { listarMiembros } from "@gym-app/domain/use-cases/ListarMiembros";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
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
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <PageHeader>Miembros</PageHeader>
        <div className="flex gap-2">
          <BotonImprimir />
          <Link href="/miembros/nuevo">
            <Button>Nuevo miembro</Button>
          </Link>
        </div>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-4 print:hidden">
        <Input name="nombre" label="Nombre o cédula" type="text" defaultValue={filtros.nombre} />
        <Input name="inscritoDesde" label="Inscritos desde" type="date" defaultValue={filtros.inscritoDesde} />
        <Input name="venceHasta" label="Vencidos hasta" type="date" defaultValue={filtros.venceHasta} />
        <Button type="submit">Filtrar</Button>
        <Link href="/miembros" className="text-sm hover:underline" style={{ color: "var(--gx-muted)" }}>
          Limpiar
        </Link>
      </form>

      <div className="hidden lg:block">
        <Card>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-sm" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
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
                <tr key={miembro.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {miembro.nombre}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {miembro.cedula}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {miembro.planTipo === "CON_ENTRENADOR" ? "Con entrenador" : "Sin entrenador"}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {miembro.fechaVencimiento
                      ? new Date(miembro.fechaVencimiento).toLocaleDateString("es-VE")
                      : "—"}
                  </td>
                  <td className="py-2">
                    <EstadoToggle id={miembro.id} activo={miembro.activo} />
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/miembros/${miembro.id}`}
                      className="text-sm font-medium hover:underline"
                      style={{ color: "var(--gx-accent)" }}
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}

              {miembros.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
                    Ningún miembro coincide con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {miembros.map((miembro) => (
          <Link key={miembro.id} href={`/miembros/${miembro.id}`}>
            <Card className="transition-transform active:scale-[0.98]">
              <div className="flex items-center justify-between">
                <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                  {miembro.nombre}
                </span>
                <EstadoToggle id={miembro.id} activo={miembro.activo} />
              </div>
              <div className="mt-2 flex justify-between text-sm" style={{ color: "var(--gx-muted)" }}>
                <span>{miembro.cedula}</span>
                <span>
                  {miembro.fechaVencimiento
                    ? `Vence ${new Date(miembro.fechaVencimiento).toLocaleDateString("es-VE")}`
                    : "Sin vencimiento"}
                </span>
              </div>
            </Card>
          </Link>
        ))}

        {miembros.length === 0 && (
          <Card>
            <p className="text-center" style={{ color: "var(--gx-muted)" }}>
              Ningún miembro coincide con los filtros.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
