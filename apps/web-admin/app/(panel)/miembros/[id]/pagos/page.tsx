import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { obtenerMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ObtenerMiembro";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

function formatearFechaHora(fecha: Date): string {
  return new Date(fecha).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });
}

function formatearRangoCiclo(inicio: Date | null, fin: Date | null): string {
  if (!inicio || !fin) return "—";
  const opciones: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
  return `${new Date(inicio).toLocaleDateString("es-VE", opciones)} → ${new Date(fin).toLocaleDateString("es-VE", opciones)}`;
}

export default async function PaginaHistorialPagos({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const { id } = await params;

  const miembro = await obtenerMiembro(
    { miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, id }
  ).catch((error) => {
    if (error instanceof MiembroNoEncontradoError) return null;
    throw error;
  });

  if (!miembro) notFound();

  const pagos = await listarPagos(
    { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, miembroId: id }
  );

  return (
    <div className="max-w-4xl p-6 lg:p-8">
      <Link
        href={`/miembros/${id}`}
        className="mb-4 inline-block text-sm font-medium hover:underline"
        style={{ color: "var(--gx-accent)" }}
      >
        ← Volver a {miembro.nombre}
      </Link>

      <div className="mb-6">
        <PageHeader>Historial de pagos</PageHeader>
      </div>

      <div className="hidden lg:block">
        <Card>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-sm" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
                <th className="py-2">Fecha y hora</th>
                <th className="py-2">Monto (USD)</th>
                <th className="py-2">Tasa aplicada</th>
                <th className="py-2">Método</th>
                <th className="py-2">Ciclo</th>
                <th className="py-2">Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((pago) => (
                <tr key={pago.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {formatearFechaHora(pago.fechaPago)}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    ${pago.monto.toFixed(2)}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {pago.tasaCambio !== null ? `Bs. ${pago.tasaCambio}` : "—"}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {pago.metodo}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {formatearRangoCiclo(pago.fechaInicioCiclo, pago.fechaFinCiclo)}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {pago.registradoPorNombre ?? "—"}
                  </td>
                </tr>
              ))}

              {pagos.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
                    Todavía no hay pagos registrados para este miembro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {pagos.map((pago) => (
          <Card key={pago.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--gx-ink)" }}>{formatearFechaHora(pago.fechaPago)}</span>
              <p className="font-semibold" style={{ color: "var(--gx-accent)" }}>
                ${pago.monto.toFixed(2)}
              </p>
            </div>
            <div className="flex flex-col gap-0.5 text-sm" style={{ color: "var(--gx-muted)" }}>
              <span>{pago.metodo}</span>
              <span>Ciclo: {formatearRangoCiclo(pago.fechaInicioCiclo, pago.fechaFinCiclo)}</span>
              <span>Tasa: {pago.tasaCambio !== null ? `Bs. ${pago.tasaCambio}` : "—"}</span>
              <span>Registró: {pago.registradoPorNombre ?? "—"}</span>
            </div>
          </Card>
        ))}

        {pagos.length === 0 && (
          <Card>
            <p className="text-center" style={{ color: "var(--gx-muted)" }}>
              Todavía no hay pagos registrados para este miembro.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
