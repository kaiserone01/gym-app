"use client";

import { useActionState, useEffect, useState } from "react";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import { useFeedback, DURACION_MS } from "@gym-app/ui/components/FeedbackOverlay";
import { BuscadorMiembro, type MiembroConPlan, type PlanParaModal } from "./SelectorMiembroModal";
import { calcularProyeccionRenovacion } from "./proyeccionRenovacion";
import { DiasDisponibles } from "../miembros/vencimiento";
import { formatearBs } from "../tasaBcvFija";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { registrarPagoAction } from "../pagos/actions";
import { calcularProyeccionAbono } from "./proyeccionAbono";
import { PanelRemanentePago } from "./PanelRemanentePago";
import { formatearFechaCorta } from "./ProyeccionCiclosUI";
import type { ReglaAbonoPorFrecuencia } from "@gym-app/domain/entities/ReglaAbono";

type Paso = 1 | 2 | 3 | 4;

const TITULOS_PASO: Record<Paso, string> = {
  1: "Elegí un miembro",
  2: "Estado de la membresía",
  3: "Método de pago",
  4: "Pago registrado",
};

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  DIARIO: "diario",
  SEMANAL: "semanal",
  QUINCENAL: "quincenal",
  MENSUAL: "mensual",
};

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function Avatar({ fotoUrl, nombre }: { fotoUrl: string | null; nombre: string }) {
  return (
    <div
      className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full text-xl font-semibold"
      style={{ background: "var(--gx-surface-2)", color: "var(--gx-muted)" }}
    >
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto de miembro servida desde R2, dominio externo
        <img src={fotoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        iniciales(nombre || "?")
      )}
    </div>
  );
}

function BarraProgreso({ paso }: { paso: Paso }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {([1, 2, 3, 4] as Paso[]).map((n) => (
        <div key={n} className="flex flex-1 items-center gap-2">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={
              n <= paso
                ? { background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }
                : { background: "var(--gx-surface-2)", color: "var(--gx-muted)" }
            }
          >
            {n}
          </div>
          {n < 4 && (
            <div
              className="h-0.5 flex-1"
              style={{ background: n < paso ? "var(--gx-accent)" : "var(--gx-edge)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ContenidoPaso1({
  miembros,
  planes,
  onSeleccionar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  onSeleccionar: (miembro: MiembroConPlan) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* grande=true solo acá — el modal standalone de /miembros y
          /pagos/nuevo (SelectorMiembroModal) sigue con su tamaño actual. */}
      <BuscadorMiembro miembros={miembros} planes={planes} onSeleccionar={onSeleccionar} grande />
    </div>
  );
}

type Modalidad = "total" | "abono" | "combinado";

function ContenidoPaso2({
  miembro,
  planes,
  planElegidoId,
  onElegirPlan,
  tasaActual,
  modalidadElegida,
  onCambiarModalidad,
  onVolver,
  onContinuar,
}: {
  miembro: MiembroConPlan;
  planes: PlanParaModal[];
  planElegidoId: string | null;
  onElegirPlan: (id: string) => void;
  tasaActual: number | null;
  modalidadElegida: Modalidad;
  onCambiarModalidad: (modalidad: Modalidad) => void;
  onVolver: () => void;
  onContinuar: (plan: PlanParaModal) => void;
}) {
  const planEfectivo = miembro.plan ?? planes.find((p) => p.id === planElegidoId);

  const proyeccion = planEfectivo
    ? calcularProyeccionRenovacion(miembro.fechaVencimiento, planEfectivo.frecuencia)
    : null;

  return (
    <div className="flex flex-col gap-5 text-base">
      <div className="flex items-center gap-4">
        <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
            {miembro.nombre}
          </p>
          <p style={{ color: "var(--gx-muted)" }}>{miembro.cedula}</p>
        </div>
      </div>

      <div className="flex justify-between">
        <span style={{ color: "var(--gx-muted)" }}>Vencimiento</span>
        <DiasDisponibles fechaVencimiento={miembro.fechaVencimiento} />
      </div>

      {planEfectivo ? (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Plan</span>
            <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
              {planEfectivo.nombre}
            </span>
          </div>
          <div className="mt-2 flex justify-between">
            <span style={{ color: "var(--gx-muted)" }}>Precio</span>
            <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
              ${planEfectivo.precioUSD.toFixed(2)}/{ETIQUETA_FRECUENCIA[planEfectivo.frecuencia]}
              {tasaActual !== null && ` · Bs. ${formatearBs(planEfectivo.precioUSD * tasaActual)}`}
            </span>
          </div>
        </div>
      ) : (
        <label className="flex flex-col gap-2" style={{ color: "var(--gx-muted)" }}>
          Este miembro no tiene un plan asignado — elegí uno para continuar
          <select
            value={planElegidoId ?? ""}
            onChange={(e) => onElegirPlan(e.target.value)}
            className="min-h-12 rounded-lg border px-3 text-base outline-none focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            <option value="">Seleccioná un plan</option>
            {planes.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nombre} — ${plan.precioUSD.toFixed(2)}
              </option>
            ))}
          </select>
        </label>
      )}

      {proyeccion && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
          <p style={{ color: "var(--gx-ink)" }}>
            Al pagar la renovación, disfrutará de <strong>{proyeccion.diasDelPlan} días</strong>
            {proyeccion.adelantandoCuota && (
              <> ({proyeccion.diasTotalesTrasPago} días en total, incluyendo los días restantes)</>
            )}
            .
          </p>
          <p className="mt-2" style={{ color: "var(--gx-muted)" }}>
            Próximo vencimiento: {formatearFechaCorta(proyeccion.fechaProximoVencimiento)}
          </p>
        </div>
      )}

      {planEfectivo && planEfectivo.precioUSD > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(
              [
                { valor: "total" as const, etiqueta: "Pago total" },
                { valor: "abono" as const, etiqueta: "Abono parcial", deshabilitado: !planEfectivo.permitePagoParcial },
                { valor: "combinado" as const, etiqueta: "Pago fraccionado" },
              ]
            ).map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                disabled={opcion.deshabilitado}
                onClick={() => !opcion.deshabilitado && onCambiarModalidad(opcion.valor)}
                className="min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium transition-colors duration-150 disabled:opacity-40"
                style={
                  modalidadElegida === opcion.valor
                    ? { borderColor: "var(--gx-accent)", background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }
                    : { borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }
                }
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>
          {/* Tarjeta de ayuda con el acento de marca — reemplaza el tooltip
              nativo del navegador (ver diseño acordado: debe destacar y
              seguir el branding, no un title del sistema). Cambia su texto
              según la modalidad elegida, siempre visible, sin interacción. */}
          <div
            className="rounded-lg border-l-4 px-3 py-2 text-xs"
            style={{ borderColor: "var(--gx-accent)", background: "color-mix(in srgb, var(--gx-accent) 10%, transparent)", color: "var(--gx-ink)" }}
          >
            {(
              {
                total: "Cobra el precio completo del plan en un solo método de pago.",
                abono:
                  "Recibe un monto menor al precio del plan — el sistema calcula cuánto queda pendiente y hasta cuándo tiene acceso.",
                combinado:
                  "Divide el monto total entre varios métodos de pago — por ejemplo, una parte en efectivo y otra en punto de venta, incluso con dos tarjetas distintas.",
              } satisfies Record<Modalidad, string>
            )[modalidadElegida]}
          </div>
          {!planEfectivo.permitePagoParcial && (
            <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
              Este plan no admite abonos — solo pago total o pago fraccionado.
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex gap-3">
        <Button type="button" variant="secundario" className="min-h-12 flex-1 text-base" onClick={onVolver}>
          Volver
        </Button>
        <Button
          type="button"
          className="min-h-12 flex-1 text-base"
          disabled={!planEfectivo}
          onClick={() => planEfectivo && onContinuar(planEfectivo)}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}

interface LineaFormulario {
  clave: string;
  monto: string;
  seleccion: {
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
    requiereNumeroOperacion: boolean;
  };
}

function nuevaLineaVacia(): LineaFormulario {
  return {
    clave: crypto.randomUUID(),
    monto: "",
    seleccion: { metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "", requiereNumeroOperacion: false },
  };
}

function ContenidoPaso3({
  miembroId,
  planId,
  monto: montoSugerido,
  frecuencia,
  permitePagoParcial,
  minimoAbonoTipo,
  minimoAbonoValor,
  fechaVencimiento,
  reglasAbono,
  modalidad,
  metodosPago,
  tasaActual,
  onVolver,
  onPagoRegistrado,
}: {
  miembroId: string;
  planId: string;
  // Precio de lista del plan — punto de partida del monto objetivo, que
  // queda editable para poder registrar un abono parcial (pagos
  // fraccionados/mixtos, ver diseño acordado). Acá no se conoce el saldo
  // pendiente real del miembro (ese cálculo vive en su ficha) — quien
  // cobra tiene que saber cuánto pedir si es un abono, no el precio completo.
  monto: number;
  frecuencia: FrecuenciaPago;
  // Si el plan no admite abono, el monto objetivo tampoco puede quedar
  // editable en modalidad Combinado — el pago combinado siempre debe
  // sumar el precio completo del plan en ese caso (nunca se restringe la
  // modalidad combinado en sí, pero sí el monto que puede cubrir, ver
  // diseño acordado y AbonoNoPermitidoError en RegistrarPago.ts).
  permitePagoParcial: boolean;
  minimoAbonoTipo: PlanParaModal["minimoAbonoTipo"];
  minimoAbonoValor: PlanParaModal["minimoAbonoValor"];
  fechaVencimiento: Date | null;
  reglasAbono: ReglaAbonoPorFrecuencia[];
  // Elegida en el Paso 2 — este paso ya no la vuelve a preguntar, solo
  // ejecuta lo elegido (ver diseño acordado, motor de reglas de abono).
  modalidad: Modalidad;
  metodosPago: MetodoPago[];
  // Solo para calcular el equivalente en Bs del precio fijo mostrado en
  // modalidad Abono (referencia) — el método elegido trae su propia tasa
  // para el campo de monto a abonar.
  tasaActual: number | null;
  onVolver: () => void;
  onPagoRegistrado: (fechaFinCicloISO: string | undefined) => void;
}) {
  const [estado, enviar, enviando] = useActionState(registrarPagoAction, {});
  const { mostrarExito, mostrarError } = useFeedback();

  // El monto objetivo queda fijo al precio del plan siempre que la
  // modalidad NO admita variar el total: en "total" siempre, y en
  // "combinado" cuando el plan no permite abono (el pago combinado nunca
  // se restringe como modalidad, pero si el plan exige el 100%, el total
  // a distribuir entre métodos tampoco puede bajar de ahí — ver
  // AbonoNoPermitidoError en RegistrarPago.ts, hallazgo de la revisión final).
  const montoObjetivoBloqueado = modalidad === "total" || (modalidad === "combinado" && !permitePagoParcial);
  const [montoObjetivoTexto, setMontoObjetivoTexto] = useState(String(montoSugerido));

  // Total y abono usan una sola línea; combinado usa el array completo.
  const [lineaUnica, setLineaUnica] = useState<LineaFormulario>(nuevaLineaVacia());
  const [lineasCombinadas, setLineasCombinadas] = useState<LineaFormulario[]>([nuevaLineaVacia(), nuevaLineaVacia()]);
  // Fraccionado: montos en Bs auxiliares por fracción (una casilla Bs por
  // cada línea, ver diseño acordado — cada fracción replica el patrón de
  // Abono: método primero, luego monto, con split Bs solo si el método
  // elegido para ESA fracción es en bolívares). Clave = LineaFormulario.clave.
  const [montosBsCombinadas, setMontosBsCombinadas] = useState<Record<string, string>>({});
  // Fraccionado: qué fracción está expandida (acordeón) — nunca más de
  // una a la vez, puede no haber ninguna abierta. Colapsar NO borra nada,
  // es solo la vista (ver diseño acordado); arranca en la primera.
  const [fraccionAbiertaClave, setFraccionAbiertaClave] = useState<string | null>(lineasCombinadas[0]?.clave ?? null);

  // Modalidad Abono: el método de pago se elige ANTES que el monto (ver
  // diseño acordado) — el precio del plan se muestra fijo como referencia
  // hasta que hay un método elegido, y recién ahí aparece el campo "Monto
  // a abonar". El monto en USD (lineaUnica.monto) es la fuente de verdad;
  // si el método es en Bs, se agrega una segunda casilla que solo
  // convierte visualmente, ver montoAbonoBsTexto más abajo.
  const esAbono = modalidad === "abono";
  const metodoAbonoElegido = esAbono && lineaUnica.seleccion.metodoPagoId !== null;
  const requiereNumeroOperacionAbono = lineaUnica.seleccion.requiereNumeroOperacion;
  const [montoAbonoBsTexto, setMontoAbonoBsTexto] = useState("");

  // Fraccionado: ya no hay un campo de "total a pagar" separado — el
  // monto objetivo es la SUMA de lo que se cargó en cada fracción (ver
  // diseño acordado, corrige la interpretación anterior).
  const sumaLineasCombinadas = lineasCombinadas.reduce((suma, l) => suma + (Number(l.monto) || 0), 0);

  const montoObjetivo = montoObjetivoBloqueado
    ? montoSugerido
    : esAbono
      ? Number(lineaUnica.monto) || 0
      : modalidad === "combinado"
        ? sumaLineasCombinadas
        : Number(montoObjetivoTexto) || 0;

  // En modalidad total (no abono, no combinado), el monto real a enviar es
  // siempre montoObjetivo, nunca lineaUnica.monto — ese campo solo se
  // actualiza dentro del onCambio de SelectorMetodoPago (útil para la
  // proyección en vivo), pero ese onCambio depende del useEffect interno
  // del selector, que NO reacciona a cambios de monto/montoObjetivo (solo a
  // metodo/esEnBs/tasa/numeroOperacion) — así que si el usuario elige
  // método y DESPUÉS edita el monto objetivo, lineaUnica.monto queda
  // desactualizado. Se fuerza acá para que lo enviado siempre coincida con
  // lo que se ve en pantalla. En abono y combinado, en cambio, el monto de
  // cada línea ES el campo editable — no se pisa.
  const lineasActivas =
    modalidad === "combinado"
      ? lineasCombinadas
      : esAbono
        ? [lineaUnica]
        : [{ ...lineaUnica, monto: String(montoObjetivo) }];
  const sumaLineas = lineasActivas.reduce((suma, l) => suma + (Number(l.monto) || 0), 0);

  // Réplica cliente del motor de reglas de abono (proyeccionAbono.ts) —
  // misma fecha base que calcularProyeccionRenovacion (Paso 2): el ciclo
  // vigente si no venció, o ahora mismo si ya venció/nunca pagó.
  const ahora = new Date();
  const fechaInicioCicloEstimada =
    fechaVencimiento !== null && fechaVencimiento > ahora ? fechaVencimiento : ahora;
  const proyeccionAbono = calcularProyeccionAbono(
    { minimoAbonoTipo, minimoAbonoValor, frecuencia, precioUSD: montoSugerido },
    reglasAbono,
    montoObjetivo,
    fechaInicioCicloEstimada,
    fechaVencimiento,
    ahora
  );

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  useEffect(() => {
    if (!estado.ok) return;
    mostrarExito(estado.ok);
    const temporizador = setTimeout(() => onPagoRegistrado(estado.fechaFinCiclo), DURACION_MS);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok, no a las funciones
  }, [estado.ok]);

  const lineasParaEnviar = lineasActivas
    .filter((l) => Number(l.monto) > 0)
    .map((l) => ({
      monto: Number(l.monto),
      metodo: l.seleccion.metodo,
      metodoPagoId: l.seleccion.metodoPagoId,
      numeroOperacion: l.seleccion.numeroOperacion || null,
      tasaCambio: l.seleccion.tasaCambio,
    }));

  // El gate del mínimo de abono NO se aplica acá a propósito (hallazgo de
  // la revisión final): esta proyección es una réplica del cliente que no
  // conoce el monto ya abonado del ciclo abierto ni el precio acordado del
  // miembro (Miembro.precioPlan), así que en un abono sucesivo puede
  // calcular un mínimo mayor al real y bloquear un cobro que el servidor
  // aceptaría. El texto informativo sigue mostrándose (ver más abajo); la
  // validación real y su mensaje de error quedan en RegistrarPago.ts
  // (AbonoMenorAlMinimoError), que sí conoce el estado real del ciclo.
  const puedeEnviar = esAbono
    ? montoObjetivo > 0 && lineaUnica.seleccion.metodoPagoId !== null
    : montoSugerido === 0 || (lineasParaEnviar.length > 0 && lineasParaEnviar.every((l) => l.metodoPagoId));

  return (
    <form action={enviar} className="flex flex-col gap-4 text-base">
      <input type="hidden" name="miembroId" value={miembroId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="origen" value="caja" />
      <input
        type="hidden"
        name="lineas"
        value={JSON.stringify(
          montoSugerido === 0
            ? [{ monto: 0, metodo: "Cortesía", metodoPagoId: null, numeroOperacion: null, tasaCambio: null }]
            : lineasParaEnviar
        )}
      />

      {/* Total, y Combinado cuando el plan no admite abono: monto fijo, sin campo editable. */}
      {montoSugerido > 0 && !esAbono && (modalidad === "total" || montoObjetivoBloqueado) && (
        <div className="flex justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--gx-surface-2)" }}>
          <span style={{ color: "var(--gx-muted)" }}>{modalidad === "combinado" ? "Total a pagar" : "Monto a cobrar"}</span>
          <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>${montoSugerido.toFixed(2)}</span>
        </div>
      )}
      {/* Fraccionado, plan que sí admite abono: precio del plan fijo como
          referencia del total a cubrir (mismo patrón que Abono, ver diseño
          acordado) — nunca es el monto que se registra, cada fracción
          define su propio monto más abajo. */}
      {montoSugerido > 0 && modalidad === "combinado" && !montoObjetivoBloqueado && (
        <div className="flex justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--gx-surface-2)" }}>
          <span style={{ color: "var(--gx-muted)" }}>Precio del plan</span>
          <span className="font-semibold" style={{ color: "var(--gx-accent)" }}>
            ${montoSugerido.toFixed(2)}
            {tasaActual !== null && ` · Bs. ${formatearBs(montoSugerido * tasaActual)}`}
          </span>
        </div>
      )}

      {/* Abono: precio del plan fijo en verde, referencia visible todo el
          paso (ver diseño acordado) — nunca es el monto que se registra. */}
      {esAbono && montoSugerido > 0 && (
        <div className="flex justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--gx-surface-2)" }}>
          <span style={{ color: "var(--gx-muted)" }}>Precio del plan</span>
          <span className="font-semibold" style={{ color: "var(--gx-accent)" }}>
            ${montoSugerido.toFixed(2)}
            {tasaActual !== null && ` · Bs. ${formatearBs(montoSugerido * tasaActual)}`}
          </span>
        </div>
      )}

      {/* Abono: el método se elige ANTES que el monto (ver diseño
          acordado) — se le pasa el precio del plan como referencia de
          monto para calcular la tasa en Bs, no como monto a cobrar. */}
      {esAbono && montoSugerido > 0 && (
        <SelectorMetodoPago
          metodos={metodosPago}
          monto={montoSugerido}
          onCambio={(seleccion) =>
            setLineaUnica((prev) => {
              // Cambiar de método en Bs a uno en USD (o viceversa) invalida
              // la casilla Bs auxiliar — se limpia para no arrastrar un
              // valor que ya no corresponde a la tasa nueva.
              if (seleccion.tasaCambio === null) setMontoAbonoBsTexto("");
              return { ...prev, seleccion };
            })
          }
          grande
          avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
          // El campo de número de operación se pide DESPUÉS del monto a
          // abonar (ver diseño acordado) — se renderiza más abajo, con el
          // mismo estado que este selector reporta vía onCambio.
          ocultarNumeroOperacion
          numeroOperacion={lineaUnica.seleccion.numeroOperacion}
          onCambioNumeroOperacion={(valor) =>
            setLineaUnica((prev) => ({ ...prev, seleccion: { ...prev.seleccion, numeroOperacion: valor } }))
          }
        />
      )}

      {/* Abono: monto a abonar, recién visible con método elegido. Cuando
          el método es en Bs, USD y Bs van en dos columnas (una sola
          "línea" visual, no dos campos apilados) — el USD sigue siendo la
          fuente de verdad, escribir en Bs solo recalcula el de arriba. */}
      {esAbono && metodoAbonoElegido && (
        <div className={lineaUnica.seleccion.tasaCambio !== null ? "grid grid-cols-2 gap-3" : ""}>
          <CurrencyInput
            name="montoAbonoUSD"
            label="Monto a abonar"
            moneda="USD"
            required
            value={lineaUnica.monto}
            onChange={(valorUSD) => {
              setLineaUnica((prev) => ({ ...prev, monto: valorUSD }));
              if (lineaUnica.seleccion.tasaCambio !== null) {
                const numero = Number(valorUSD);
                setMontoAbonoBsTexto(Number.isNaN(numero) || valorUSD === "" ? "" : String(numero * lineaUnica.seleccion.tasaCambio));
              }
            }}
          />
          {lineaUnica.seleccion.tasaCambio !== null && (
            <CurrencyInput
              name="montoAbonoBs"
              label="Monto a abonar (Bs)"
              moneda="Bs"
              value={montoAbonoBsTexto}
              onChange={(valorBs) => {
                setMontoAbonoBsTexto(valorBs);
                const numero = Number(valorBs);
                const tasa = lineaUnica.seleccion.tasaCambio ?? 0;
                setLineaUnica((prev) => ({
                  ...prev,
                  monto: Number.isNaN(numero) || valorBs === "" || tasa === 0 ? "" : String(numero / tasa),
                }));
              }}
            />
          )}
        </div>
      )}

      {/* Número de operación — recién después del monto (ver diseño
          acordado), solo cuando el método elegido lo pide (todos menos
          Efectivo, ver SelectorMetodoPago/requiereNumeroOperacion). */}
      {esAbono && metodoAbonoElegido && requiereNumeroOperacionAbono && (
        <Input
          label="Número de operación (últimos 4 dígitos)"
          required
          maxLength={4}
          pattern="[0-9]{4}"
          value={lineaUnica.seleccion.numeroOperacion}
          onChange={(e) =>
            setLineaUnica((prev) => ({ ...prev, seleccion: { ...prev.seleccion, numeroOperacion: e.target.value } }))
          }
        />
      )}

      {/* La proyección + detalle de ciclos del abono ya NO se muestra acá
          dentro del modal — se desacopló al panel flotante (PanelRemanentePago),
          visible para las 3 modalidades sin saturar/refrescar el modal
          (ver diseño acordado). */}

      {montoObjetivo > 0 && !esAbono && modalidad !== "combinado" && (
        <SelectorMetodoPago
          metodos={metodosPago}
          monto={montoObjetivo}
          onCambio={(seleccion) => setLineaUnica((prev) => ({ ...prev, monto: String(montoObjetivo), seleccion }))}
          grande
          avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
        />
      )}

      {montoSugerido > 0 && modalidad === "combinado" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium" style={{ color: "var(--gx-muted)" }}>
            Distribución del pago
          </p>
          {lineasCombinadas.map((linea, indice) => {
            const expandida = fraccionAbiertaClave === linea.clave;
            const montoLinea = Number(linea.monto) || 0;
            return (
              <div key={linea.clave} className="rounded-lg border" style={{ borderColor: "var(--gx-edge)" }}>
                <button
                  type="button"
                  onClick={() => setFraccionAbiertaClave(expandida ? null : linea.clave)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left"
                >
                  <span className="text-sm font-medium" style={{ color: "var(--gx-ink)" }}>
                    Fracción {indice + 1}
                  </span>
                  {/* Resumen (monto + método) visible siempre, colapsada o
                      expandida (ver diseño acordado) — deja de ocultarse
                      al expandir. */}
                  <span className="flex-1 truncate text-sm" style={{ color: "var(--gx-muted)" }}>
                    {montoLinea > 0 ? `$${montoLinea.toFixed(2)}` : "Sin monto"}
                    {linea.seleccion.metodo && ` · ${linea.seleccion.metodo}`}
                  </span>
                  <span style={{ color: "var(--gx-muted)" }}>{expandida ? "▲" : "▼"}</span>
                </button>
                {/* Siempre montado (nunca desmontado con {expandida && ...})
                    — SelectorMetodoPago guarda su propio estado interno
                    (tipo/instancia elegida) que se perdía al remontar cada
                    vez que se colapsaba la fracción. Colapsar ahora es
                    puramente visual (`hidden`), preserva ese estado. */}
                <div className={`flex flex-col gap-3 border-t p-3 ${expandida ? "" : "hidden"}`} style={{ borderColor: "var(--gx-edge)" }}>
                    {lineasCombinadas.length > 2 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setLineasCombinadas((prev) => prev.filter((_, i) => i !== indice));
                            setMontosBsCombinadas((prev) => {
                              const { [linea.clave]: _quitada, ...resto } = prev;
                              return resto;
                            });
                            setFraccionAbiertaClave(null);
                          }}
                          className="text-sm"
                          style={{ color: "var(--gx-bad)" }}
                        >
                          Quitar esta fracción
                        </button>
                      </div>
                    )}

                    {/* Método primero (igual que Abono, ver diseño acordado)
                        — antes de tener un monto propio, se le pasa el
                        precio del plan como referencia para calcular la
                        tasa en Bs. */}
                    <SelectorMetodoPago
                      metodos={metodosPago}
                      monto={montoLinea > 0 ? montoLinea : montoSugerido}
                      onCambio={(seleccion) =>
                        setLineasCombinadas((prev) => prev.map((l, i) => (i === indice ? { ...l, seleccion } : l)))
                      }
                      ocultarNumeroOperacion
                      numeroOperacion={linea.seleccion.numeroOperacion}
                      onCambioNumeroOperacion={(valor) =>
                        setLineasCombinadas((prev) =>
                          prev.map((l, i) => (i === indice ? { ...l, seleccion: { ...l.seleccion, numeroOperacion: valor } } : l))
                        )
                      }
                    />

                    {/* Monto de esta fracción, recién visible con método
                        elegido — split USD/Bs solo si el método de ESTA
                        fracción es en bolívares (ver diseño acordado). */}
                    {linea.seleccion.metodoPagoId !== null && (
                      <div className={linea.seleccion.tasaCambio !== null ? "grid grid-cols-2 gap-3" : ""}>
                        <CurrencyInput
                          name={`monto-linea-${indice}`}
                          label="Monto de esta fracción (USD)"
                          moneda="USD"
                          required
                          value={linea.monto}
                          onChange={(valorUSD) => {
                            setLineasCombinadas((prev) => prev.map((l, i) => (i === indice ? { ...l, monto: valorUSD } : l)));
                            if (linea.seleccion.tasaCambio !== null) {
                              const numero = Number(valorUSD);
                              setMontosBsCombinadas((prev) => ({
                                ...prev,
                                [linea.clave]:
                                  Number.isNaN(numero) || valorUSD === "" ? "" : String(numero * linea.seleccion.tasaCambio!),
                              }));
                            }
                          }}
                        />
                        {linea.seleccion.tasaCambio !== null && (
                          <CurrencyInput
                            name={`monto-linea-${indice}-bs`}
                            label="Monto de esta fracción (Bs)"
                            moneda="Bs"
                            value={montosBsCombinadas[linea.clave] ?? ""}
                            onChange={(valorBs) => {
                              setMontosBsCombinadas((prev) => ({ ...prev, [linea.clave]: valorBs }));
                              const numero = Number(valorBs);
                              const tasa = linea.seleccion.tasaCambio ?? 0;
                              setLineasCombinadas((prev) =>
                                prev.map((l, i) =>
                                  i === indice
                                    ? { ...l, monto: Number.isNaN(numero) || valorBs === "" || tasa === 0 ? "" : String(numero / tasa) }
                                    : l
                                )
                              );
                            }}
                          />
                        )}
                      </div>
                    )}

                    {/* Número de operación — recién después del monto,
                        solo si el método elegido lo pide. */}
                    {linea.seleccion.metodoPagoId !== null && linea.seleccion.requiereNumeroOperacion && (
                      <Input
                        label="Número de operación (últimos 4 dígitos)"
                        required
                        maxLength={4}
                        pattern="[0-9]{4}"
                        value={linea.seleccion.numeroOperacion}
                        onChange={(e) =>
                          setLineasCombinadas((prev) =>
                            prev.map((l, i) => (i === indice ? { ...l, seleccion: { ...l.seleccion, numeroOperacion: e.target.value } } : l))
                          )
                        }
                      />
                    )}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              const nueva = nuevaLineaVacia();
              setLineasCombinadas((prev) => [...prev, nueva]);
              setFraccionAbiertaClave(nueva.clave);
            }}
            className="min-h-11 rounded-lg border px-3 text-sm font-medium"
            style={{ borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          >
            + Agregar fracción
          </button>
          <div className="flex justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--gx-surface-2)" }}>
            <span style={{ color: "var(--gx-muted)" }}>Total ingresado</span>
            <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
              ${sumaLineas.toFixed(2)}
              {tasaActual !== null && ` · Bs. ${formatearBs(sumaLineas * tasaActual)}`}
            </span>
          </div>
        </div>
      )}

      {/* Panel flotante — desacoplado del modal para las 3 modalidades (ver
          diseño acordado: evita saturar/refrescar el modal). En Total y
          Abono, lineasActivas ya resuelve a una sola línea equivalente
          (ver definición arriba); en Fraccionado, a las N fracciones. */}
      {montoSugerido > 0 && (
        <PanelRemanentePago
          lineas={lineasActivas.map((l) => ({ metodo: l.seleccion.metodo, monto: Number(l.monto) || 0 }))}
          // El objetivo real a cubrir es el precio del plan — montoObjetivo
          // ya ES la suma de las fracciones en Fraccionado (ver diseño
          // acordado), así que compararlo contra sí mismo siempre daría
          // remanente $0. En Total/Abono también es el precio del plan.
          montoObjetivo={montoSugerido}
          tasaReferencia={lineasActivas.find((l) => l.seleccion.tasaCambio !== null)?.seleccion.tasaCambio ?? null}
          // Proyección + detalle de ciclos, siempre visible (ver diseño
          // acordado: "que el cliente vea que cubre su pago"), calculada
          // sobre la SUMA de todas las líneas activas — se actualiza en vivo.
          proyeccion={sumaLineas > 0 ? proyeccionAbono : null}
        />
      )}

      {montoSugerido === 0 && (
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          Este plan no tiene costo — no hace falta elegir método de pago.
        </p>
      )}

      <div className="mt-2 flex gap-3">
        <Button
          type="button"
          variant="secundario"
          className="min-h-12 flex-1 text-base"
          onClick={onVolver}
          disabled={enviando}
        >
          Volver
        </Button>
        <Button type="submit" className="min-h-12 flex-1 text-base" disabled={enviando || !puedeEnviar}>
          {enviando ? "Registrando..." : "Registrar pago"}
        </Button>
      </div>
    </form>
  );
}

function ContenidoPaso4({
  miembro,
  planNombre,
  fechaFinCiclo,
  onCerrar,
}: {
  miembro: MiembroConPlan;
  planNombre: string;
  fechaFinCiclo: Date | null;
  onCerrar: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 text-base">
      <div className="flex items-center gap-4">
        <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
            {miembro.nombre}
          </p>
          <p style={{ color: "var(--gx-muted)" }}>{miembro.cedula}</p>
        </div>
      </div>

      <div className="flex justify-between">
        <span style={{ color: "var(--gx-muted)" }}>Nuevo vencimiento</span>
        <DiasDisponibles fechaVencimiento={fechaFinCiclo} />
      </div>

      {fechaFinCiclo && (
        <p className="text-right" style={{ color: "var(--gx-muted)" }}>
          {formatearFechaCorta(fechaFinCiclo)}
        </p>
      )}

      <div className="flex justify-between">
        <span style={{ color: "var(--gx-muted)" }}>Plan</span>
        <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
          {planNombre}
        </span>
      </div>

      <Button type="button" className="min-h-12 mt-2 text-base" onClick={onCerrar}>
        Cerrar
      </Button>
    </div>
  );
}

export function ModalRegistrarPagoCaja({
  miembros,
  planes,
  metodosPago,
  tasaActual,
  reglasAbono,
  onCerrar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  reglasAbono: ReglaAbonoPorFrecuencia[];
  onCerrar: () => void;
}) {
  const [paso, setPaso] = useState<Paso>(1);
  const [miembroElegido, setMiembroElegido] = useState<MiembroConPlan | null>(null);
  const [planElegidoId, setPlanElegidoId] = useState<string | null>(null);
  const [modalidadElegida, setModalidadElegida] = useState<Modalidad>("total");
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [fechaFinCicloFinal, setFechaFinCicloFinal] = useState<Date | null>(null);

  function pedirCierre() {
    if (paso === 1 || paso === 4) {
      onCerrar();
      return;
    }
    setConfirmandoCierre(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Registrar pago"
      onClick={pedirCierre}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border-2 p-8 text-base"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center justify-center">
          <h3 className="text-center text-2xl font-bold" style={{ color: "var(--gx-ink)" }}>
            {TITULOS_PASO[paso]}
          </h3>
          <button
            type="button"
            onClick={pedirCierre}
            aria-label="Cerrar"
            className="absolute right-0 rounded-full p-1.5 text-base transition-colors duration-150 hover:bg-[var(--gx-surface-2)]"
            style={{ color: "var(--gx-muted)" }}
          >
            ✕
          </button>
        </div>

        <BarraProgreso paso={paso} />

        {confirmandoCierre && (
          <div
            className="mb-4 rounded-lg border-2 p-4"
            style={{ borderColor: "var(--gx-bad)", background: "var(--gx-surface-2)" }}
          >
            <p className="text-base" style={{ color: "var(--gx-ink)" }}>
              ¿Descartar este pago en curso? Se perderá la selección hecha hasta ahora.
            </p>
            <div className="mt-3 flex gap-3">
              <Button
                type="button"
                variant="secundario"
                className="min-h-12 flex-1 text-base"
                onClick={() => setConfirmandoCierre(false)}
              >
                Seguir aquí
              </Button>
              <Button type="button" variant="peligro" className="min-h-12 flex-1 text-base" onClick={onCerrar}>
                Descartar
              </Button>
            </div>
          </div>
        )}

        {paso === 1 && (
          <ContenidoPaso1
            miembros={miembros}
            planes={planes}
            onSeleccionar={(m) => {
              setMiembroElegido(m);
              setPlanElegidoId(null);
              setPaso(2);
            }}
          />
        )}

        {paso === 2 && miembroElegido && (
          <ContenidoPaso2
            miembro={miembroElegido}
            planes={planes}
            planElegidoId={planElegidoId}
            onElegirPlan={setPlanElegidoId}
            tasaActual={tasaActual}
            modalidadElegida={modalidadElegida}
            onCambiarModalidad={setModalidadElegida}
            onVolver={() => setPaso(1)}
            onContinuar={(plan) => {
              setPlanElegidoId(plan.id);
              setPaso(3);
            }}
          />
        )}

        {paso === 3 && miembroElegido && planElegidoId && (
          <ContenidoPaso3
            miembroId={miembroElegido.id}
            planId={planElegidoId}
            monto={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.precioUSD ?? 0
            }
            frecuencia={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.frecuencia ?? "MENSUAL"
            }
            permitePagoParcial={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.permitePagoParcial ?? true
            }
            minimoAbonoTipo={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.minimoAbonoTipo ?? null
            }
            minimoAbonoValor={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.minimoAbonoValor ?? null
            }
            fechaVencimiento={miembroElegido.fechaVencimiento}
            reglasAbono={reglasAbono}
            modalidad={modalidadElegida}
            metodosPago={metodosPago}
            tasaActual={tasaActual}
            onVolver={() => setPaso(2)}
            onPagoRegistrado={(fechaFinCicloISO) => {
              setFechaFinCicloFinal(fechaFinCicloISO ? new Date(fechaFinCicloISO) : null);
              setPaso(4);
            }}
          />
        )}

        {paso === 4 && miembroElegido && (
          <ContenidoPaso4
            miembro={miembroElegido}
            planNombre={
              (miembroElegido.plan ?? planes.find((p) => p.id === planElegidoId))?.nombre ?? "—"
            }
            fechaFinCiclo={fechaFinCicloFinal}
            onCerrar={onCerrar}
          />
        )}
      </div>
    </div>
  );
}
