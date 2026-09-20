import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { Button } from "@gym-app/ui/components/Button";
import { Badge } from "@gym-app/ui/components/Badge";
import { Card } from "@gym-app/ui/components/Card";
import { PageHeader } from "@gym-app/ui/components/PageHeader";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

export default async function PaginaPlanes() {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const planes = await listarPlanes({ planes: new PrismaPlanRepository(prisma) }, usuario.organizacionId);

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <PageHeader>Planes</PageHeader>
        <Link href="/planes/nuevo">
          <Button>Nuevo plan</Button>
        </Link>
      </div>

      <div className="hidden lg:block">
        <Card>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b text-sm" style={{ borderColor: "var(--gx-edge)", color: "var(--gx-muted)" }}>
                <th className="py-2">Nombre</th>
                <th className="py-2">Frecuencia</th>
                <th className="py-2">Entrenador</th>
                <th className="py-2">Precio (USD)</th>
                <th className="py-2">Estado</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {planes.map((plan) => (
                <tr key={plan.id} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {plan.nombre}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {ETIQUETA_FRECUENCIA[plan.frecuencia]}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    {plan.incluyeEntrenador ? "Incluido" : "No incluido"}
                  </td>
                  <td className="py-2" style={{ color: "var(--gx-ink)" }}>
                    ${plan.precioUSD.toFixed(2)}
                  </td>
                  <td className="py-2">
                    <Badge tono={plan.activo ? "verde" : "gris"}>{plan.activo ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/planes/${plan.id}`}
                      className="text-sm font-medium hover:underline"
                      style={{ color: "var(--gx-accent)" }}
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}

              {planes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center" style={{ color: "var(--gx-muted)" }}>
                    Todavía no hay planes. Creá el primero.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {planes.map((plan) => (
          <Link key={plan.id} href={`/planes/${plan.id}`}>
            <Card className="transition-transform active:scale-[0.98]">
              <div className="flex items-center justify-between">
                <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                  {plan.nombre}
                </span>
                <Badge tono={plan.activo ? "verde" : "gris"}>{plan.activo ? "Activo" : "Inactivo"}</Badge>
              </div>
              <div className="mt-2 flex justify-between text-sm" style={{ color: "var(--gx-muted)" }}>
                <span>
                  {ETIQUETA_FRECUENCIA[plan.frecuencia]}
                  {plan.incluyeEntrenador ? " · con entrenador" : ""}
                </span>
                <span>${plan.precioUSD.toFixed(2)}</span>
              </div>
            </Card>
          </Link>
        ))}

        {planes.length === 0 && (
          <Card>
            <p className="text-center" style={{ color: "var(--gx-muted)" }}>
              Todavía no hay planes. Creá el primero.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
