import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { listarPagos } from "@gym-app/domain/use-cases/ListarPagos";
import { Button } from "@gym-app/ui/components/Button";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";

export default async function PaginaPagos() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const pagos = await listarPagos(
    { pagos: new PrismaPagoRepository(prisma), miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId }
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <PageHeader>Pagos</PageHeader>
        <Link href="/pagos/nuevo">
          <Button>Registrar pago</Button>
        </Link>
      </div>

      <div className="hidden lg:block">
        <Card>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-sm" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
                <th className="py-2">Fecha</th>
                <th className="py-2">Miembro</th>
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
                  <td className="py-2">
                    <Link
                      href={`/miembros/${pago.miembroId}`}
                      className="hover:underline"
                      style={{ color: "var(--gx-accent)" }}
                    >
                      {pago.miembroNombre ?? pago.miembroId}
                    </Link>
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
                  <td colSpan={4} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
                    Todavía no hay pagos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {pagos.map((pago) => (
          <Card key={pago.id}>
            <div className="flex items-center justify-between">
              <Link
                href={`/miembros/${pago.miembroId}`}
                className="font-medium hover:underline"
                style={{ color: "var(--gx-ink)" }}
              >
                {pago.miembroNombre ?? pago.miembroId}
              </Link>
              <span className="font-semibold" style={{ color: "var(--gx-accent)" }}>
                ${pago.monto.toFixed(2)}
              </span>
            </div>
            <div className="mt-2 flex justify-between text-sm" style={{ color: "var(--gx-muted)" }}>
              <span>{new Date(pago.fechaPago).toLocaleDateString("es-VE")}</span>
              <span>{pago.metodo}</span>
            </div>
          </Card>
        ))}

        {pagos.length === 0 && (
          <Card>
            <p className="text-center" style={{ color: "var(--gx-muted)" }}>
              Todavía no hay pagos registrados.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
