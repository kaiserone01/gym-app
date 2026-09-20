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

export default async function PaginaHistorialPagos({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

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
    <div className="max-w-2xl p-6 lg:p-8">
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
                <th className="py-2">Fecha</th>
                <th className="py-2">Monto (USD)</th>
                <th className="py-2">Método</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((pago) => (
                <tr key={pago.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {new Date(pago.fechaPago).toLocaleDateString("es-VE")}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    ${pago.monto.toFixed(2)}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {pago.metodo}
                  </td>
                </tr>
              ))}

              {pagos.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
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
          <Card key={pago.id} className="flex items-center justify-between">
            <span style={{ color: "var(--gx-ink)" }}>{new Date(pago.fechaPago).toLocaleDateString("es-VE")}</span>
            <div className="text-right">
              <p className="font-semibold" style={{ color: "var(--gx-accent)" }}>
                ${pago.monto.toFixed(2)}
              </p>
              <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
                {pago.metodo}
              </p>
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
