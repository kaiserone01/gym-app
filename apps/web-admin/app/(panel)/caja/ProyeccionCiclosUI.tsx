"use client";

// Componentes de presentación puros para la proyección de ciclos y el
// mensaje de abono — separados de ModalRegistrarPagoCaja.tsx y
// PanelRemanentePago.tsx específicamente para que ambos puedan importarlos
// sin crear una dependencia circular entre esos dos archivos (Panel usa
// estos componentes, y Modal usa Panel).
import { formatearBs } from "../tasaBcvFija";
import type { CicloProyectado } from "@gym-app/domain/entities/ReglaAbono";
import type { ProyeccionAbono } from "./proyeccionAbono";

export function formatearFechaCorta(fecha: Date): string {
  return new Date(fecha).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Lista de períodos que cubre un pago, sin límite de cantidad (ver diseño
// acordado) — el tramo ya vigente antes de este pago se marca en un color
// distinto (acento suave) del resto, que son períodos NUEVOS que este pago
// agrega (acento fuerte) o el remanente parcial final (mutado, sin
// completar un período). Se usa igual en Total, Abono y Fraccionado. Solo
// se muestra con 2+ elementos — un pago de un único período completo no
// necesita detalle, ya lo dice el monto (ver copy simplificado).
export function DetalleCiclosPago({ ciclos }: { ciclos: CicloProyectado[] }) {
  if (ciclos.length < 2) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--gx-edge)" }}>
      <p className="mb-1 font-medium" style={{ color: "var(--gx-muted)" }}>
        Detalle de períodos que cubre este pago
      </p>
      {(() => {
        let numeroPeriodo = 0;
        return ciclos.map((ciclo, indice) => {
          if (ciclo.tipo !== "vigente") numeroPeriodo++;
          return (
            <div
              key={indice}
              className="flex items-center justify-between rounded-md px-2 py-1"
              style={
                ciclo.tipo === "vigente"
                  ? { background: "color-mix(in srgb, var(--gx-muted) 12%, transparent)" }
                  : { background: "color-mix(in srgb, var(--gx-accent) 10%, transparent)" }
              }
            >
              <span style={{ color: "var(--gx-ink)" }}>
                {ciclo.tipo === "vigente"
                  ? "Ya vigente"
                  : ciclo.tipo === "parcial"
                    ? `Período ${numeroPeriodo} parcial (${ciclo.porcentajeCubierto.toFixed(0)}%)`
                    : `Período ${numeroPeriodo}`}
              </span>
              <span style={{ color: "var(--gx-muted)" }}>
                {formatearFechaCorta(ciclo.inicio)} – {formatearFechaCorta(ciclo.fin)}
              </span>
            </div>
          );
        });
      })()}
    </div>
  );
}

// Mensaje de proyección — el copy cambia según la modalidad y el contexto,
// para no repetir lo que el detalle de períodos o el monto ya visible
// arriba comunican (ver diseño acordado: "simple, minimalista, curva de
// aprendizaje mínima").
//
// - Pago Total: nunca es un abono parcial — o paga el período completo, o
//   adelanta N períodos completos. El detalle de períodos (DetalleCiclosPago)
//   ya dice cuáles cubre; acá no hace falta ningún párrafo. Devuelve null
//   siempre en esta modalidad.
// - Abono parcial: la intención ES dejar un abono abierto, así que sí
//   aplica el mensaje de "queda como abono" con plazo/fecha tope —
//   · Por debajo del mínimo: cuánto falta abonar como mínimo.
//   · Abono parcial normal (no cumple el período): saldo remanente y
//     fecha tope, destacados. Sin repetir el precio del plan (ya está
//     arriba) ni el % / días (el saldo y la fecha ya bastan).
//   · Cubre el período exacto: una confirmación simple.
//   · Adelanta el próximo período: aviso breve de qué período se está
//     adelantando, con el mismo saldo+fecha si ese adelanto quedó parcial.
// - Fraccionado: la intención es pagar el total AHORA repartido entre
//   métodos — nunca es un abono con plazo. Si falta dinero es un error de
//   conteo del cajero, no un abono válido: se avisa cuánto falta, sin
//   mencionar plazos ni fechas límite. Si sobra, se avisa el excedente.
//   Exacto: confirmación simple (o el mismo aviso de adelanto de Abono, si
//   el excedente alcanza a cubrir el próximo período completo).
//
// Devuelve null si no hay nada que proyectar.
export function MensajeProyeccionAbono({
  proyeccionAbono,
  montoSugerido,
  montoObjetivo,
  tasaActual,
  modalidad,
}: {
  proyeccionAbono: ProyeccionAbono;
  // Precio del plan (período actual) a cubrir.
  montoSugerido: number;
  // Monto realmente cargado hasta ahora (suma de fracciones, o el abono
  // tipeado).
  montoObjetivo: number;
  tasaActual: number | null;
  modalidad: "total" | "abono" | "combinado";
}) {
  if (montoObjetivo <= 0) return null;
  // Pago Total: nunca es un abono — el detalle de períodos ya es
  // autoexplicativo, no se agrega ningún párrafo extra.
  if (modalidad === "total") return null;

  // Fraccionado: se está pagando el total ahora, repartido entre métodos —
  // nunca se comunica como "abono con plazo" (proyeccionAbono.saldoRemanente
  // /esAdelantoCicloSiguiente tienen semántica de PRÓXIMO período, que acá
  // no aplica). Se compara directo lo cargado contra el precio del plan:
  // falta, sobra, o exacto (el panel de abajo ya muestra la cifra con
  // "Falta $X" / "Sobra $X"; acá solo el mensaje).
  if (modalidad === "combinado") {
    if (montoObjetivo < montoSugerido) {
      return (
        <p className="text-sm font-semibold" style={{ color: "var(--gx-bad)" }}>
          Falta dinero para completar el pago.
        </p>
      );
    }
    if (montoObjetivo > montoSugerido) {
      return (
        <p className="text-sm font-semibold" style={{ color: "var(--gx-accent)" }}>
          Se excedió el monto a pagar.
        </p>
      );
    }
    return (
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        Este monto cubre el período completo.
      </p>
    );
  }

  // Abono parcial: acá sí es un abono con plazo — misma lógica que antes.
  if (!proyeccionAbono.cumpleMinimo) {
    return (
      <p className="text-sm" style={{ color: "var(--gx-bad)" }}>
        El abono mínimo para este plan es ${proyeccionAbono.montoMinimo.toFixed(2)}.
      </p>
    );
  }

  // Cubre el período (actual o, si ya estaba saldado, el siguiente que se
  // adelanta) sin dejar remanente — confirmación simple, sin cifras
  // repetidas.
  if (!proyeccionAbono.fechaTope) {
    return (
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        {proyeccionAbono.esAdelantoCicloSiguiente
          ? "Este pago adelanta el próximo período completo."
          : "Este monto cubre el período completo."}
      </p>
    );
  }

  return (
    <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
      {proyeccionAbono.esAdelantoCicloSiguiente && <>Adelanta el próximo período — </>}
      Queda como abono. Tiene que cancelar el{" "}
      <strong style={{ color: "var(--gx-accent)" }}>
        saldo remanente de ${proyeccionAbono.saldoRemanente.toFixed(2)}
        {tasaActual !== null && ` (Bs. ${formatearBs(proyeccionAbono.saldoRemanente * tasaActual)})`} antes del{" "}
        {proyeccionAbono.fechaTope.toLocaleDateString("es-VE")}
      </strong>
      .
    </p>
  );
}
