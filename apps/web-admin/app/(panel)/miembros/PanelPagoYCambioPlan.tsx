"use client";

import { useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Card } from "@gym-app/ui/components/Card";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { FormularioPago, type PlanParaSelector, type PlanFijo } from "../pagos/FormularioPago";
import { FormularioCambiarPlan, type PlanParaCambio } from "./FormularioCambiarPlan";
import type { EstadoFormularioPago, EstadoCambioPlan } from "../pagos/actions";

type Tab = "pago" | "cambiarPlan";

// Antes eran dos <Card> separadas, cada una con su propia grilla de método
// de pago — se veían las dos a la vez apenas elegías un plan con
// entrenador, como si hicieran falta dos pagos. Con pestañas solo se ve
// una grilla por vez (ver diseño acordado, Opción A del mockup).
export function PanelPagoYCambioPlan({
  miembroId,
  accionRegistrarPago,
  accionCambiarPlan,
  planes,
  planFijo,
  metodosPago,
  tieneCicloVigente,
  planActualId,
  precioActual,
  frecuenciaActual,
}: {
  miembroId: string;
  accionRegistrarPago: (estado: EstadoFormularioPago, formData: FormData) => Promise<EstadoFormularioPago>;
  accionCambiarPlan: (estado: EstadoCambioPlan, formData: FormData) => Promise<EstadoCambioPlan>;
  planes: PlanParaSelector[];
  planFijo?: PlanFijo;
  metodosPago: MetodoPago[];
  tieneCicloVigente: boolean;
  planActualId: string | null;
  precioActual: number;
  frecuenciaActual: FrecuenciaPago;
}) {
  const [tab, setTab] = useState<Tab>("pago");
  const planesParaCambio: PlanParaCambio[] = planes;

  return (
    <Card>
      {tieneCicloVigente && (
        <div className="mb-4 flex gap-1 rounded-lg border p-1" style={{ borderColor: "var(--gx-edge)" }}>
          <Button
            type="button"
            variant={tab === "pago" ? "primario" : "fantasma"}
            className="flex-1"
            onClick={() => setTab("pago")}
          >
            Registrar pago
          </Button>
          <Button
            type="button"
            variant={tab === "cambiarPlan" ? "primario" : "fantasma"}
            className="flex-1"
            onClick={() => setTab("cambiarPlan")}
          >
            Cambiar de plan
          </Button>
        </div>
      )}

      {(!tieneCicloVigente || tab === "pago") && (
        <>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
            Registrar pago
          </h2>
          <FormularioPago
            accion={accionRegistrarPago}
            miembros={[]}
            planes={planes}
            metodosPago={metodosPago}
            miembroIdFijo={miembroId}
            planFijo={planFijo}
            origen="miembro"
          />
        </>
      )}

      {tieneCicloVigente && tab === "cambiarPlan" && (
        <>
          <p className="mb-4 text-xs" style={{ color: "var(--gx-muted)" }}>
            Para subir o bajar de plan sin esperar a que venza el ciclo actual — cobra solo la diferencia de precio,
            si la hay. El vencimiento no cambia.
          </p>
          <FormularioCambiarPlan
            accion={accionCambiarPlan}
            miembroId={miembroId}
            planes={planesParaCambio}
            planActualId={planActualId}
            precioActual={precioActual}
            frecuenciaActual={frecuenciaActual}
            metodosPago={metodosPago}
          />
        </>
      )}
    </Card>
  );
}
