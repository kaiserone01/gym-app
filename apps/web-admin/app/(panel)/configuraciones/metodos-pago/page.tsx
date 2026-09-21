import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { listarMetodosPago } from "@gym-app/domain/use-cases/ListarMetodosPago";
import { Card } from "@gym-app/ui/components/Card";
import { Badge } from "@gym-app/ui/components/Badge";
import { Button } from "@gym-app/ui/components/Button";
import { ETIQUETA_TIPO_METODO_PAGO, TONO_TIPO_METODO_PAGO } from "../metodosPagoUI";
import { ToggleActivoMetodoPago } from "./ToggleActivoMetodoPago";

export default async function PaginaMetodosPago() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const metodos = await listarMetodosPago({ metodosPago: new PrismaMetodoPagoRepository(prisma) }, usuario.organizacionId);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Link href="/configuraciones/metodos-pago/nuevo">
          <Button>Nuevo método de pago</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metodos.map((metodo) => (
          <Card key={metodo.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Badge tono={TONO_TIPO_METODO_PAGO[metodo.tipo]}>{ETIQUETA_TIPO_METODO_PAGO[metodo.tipo]}</Badge>
              <ToggleActivoMetodoPago id={metodo.id} activo={metodo.activo} />
            </div>

            <div className="flex items-center gap-3">
              {metodo.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo servido desde R2, dominio externo
                <img src={metodo.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ background: "var(--gx-surface-2)", color: "var(--gx-muted)" }}
                >
                  {metodo.moneda}
                </div>
              )}
              <div>
                <p className="font-medium" style={{ color: "var(--gx-ink)" }}>
                  {metodo.nombreBanco ?? (metodo.moneda === "USD" ? "Efectivo (USD)" : "Efectivo (Bs)")}
                </p>
                <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
                  {metodo.moneda === "BS" ? "Opera en bolívares" : "Opera en dólares"}
                </p>
              </div>
            </div>

            <Link
              href={`/configuraciones/metodos-pago/${metodo.id}`}
              className="text-sm font-medium hover:underline"
              style={{ color: "var(--gx-accent)" }}
            >
              Editar
            </Link>
          </Card>
        ))}

        {metodos.length === 0 && (
          <Card>
            <p className="text-center" style={{ color: "var(--gx-muted)" }}>
              Todavía no hay métodos de pago configurados.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
