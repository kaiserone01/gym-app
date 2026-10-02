"use client";

import { useActionState, useEffect, useState } from "react";
import type { Miembro } from "@gym-app/domain/entities/Miembro";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { MAX_DIAS_ATRAS_PAGO_RETROACTIVO } from "@gym-app/domain/entities/Pago";
import { Button } from "@gym-app/ui/components/Button";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import { useFeedback, DURACION_MS } from "@gym-app/ui/components/FeedbackOverlay";
import { BuscadorMiembro, aMiembroConPlan, type MiembroConPlan, type PlanParaModal } from "./SelectorMiembroModal";
import { calcularProyeccionRenovacion } from "./proyeccionRenovacion";
import { DiasDisponibles } from "../miembros/vencimiento";
import { formatearBs } from "../tasaBcvFija";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { CampoNumeroOperacion } from "../pagos/CampoNumeroOperacion";
import { MetodoYCampos } from "../pagos/MetodoYCampos";
import { TarjetaOpcion } from "./MarcoAsistente";
import { registrarPagoAction, type EstadoCambioPlan } from "../pagos/actions";
import { calcularProyeccionAbono } from "./proyeccionAbono";
import { PanelRemanentePago } from "./PanelRemanentePago";
import { ModalDetalleDeuda } from "./ModalDetalleDeuda";
import { Badge } from "@gym-app/ui/components/Badge";
import type { GrupoDeudasMiembro } from "@gym-app/domain/use-cases/ListarDeudasPendientes";
import { formatearFechaCorta } from "./ProyeccionCiclosUI";
import type { ReglaAbonoPorFrecuencia } from "@gym-app/domain/entities/ReglaAbono";
import { FormularioCambiarPlan, type EntrenadorParaCambio, type ProyeccionCambioPlan } from "../miembros/FormularioCambiarPlan";

type Paso = 1 | 2 | 3 | 4;

function fechaALocalISO(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

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
  SEMESTRAL: "semestral",
  ANUAL: "anual",
  PERSONALIZADO: "personalizado",
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

function CabeceraMiembro({ miembro }: { miembro: MiembroConPlan }) {
  return (
    <div className="flex items-center gap-4 rounded-xl p-4" style={{ background: "var(--gx-surface-2)" }}>
      <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
          {miembro.nombre}
        </p>
        <p style={{ color: "var(--gx-muted)" }}>{miembro.cedula}</p>
      </div>
    </div>
  );
}

function BarraProgreso({ paso, compacta = false }: { paso: Paso; compacta?: boolean }) {
  return (
    <div className={`${compacta ? "mb-3" : "mb-6"} flex items-center gap-2`}>
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

const OPCIONES_MODALIDAD: { valor: Modalidad; titulo: string; descripcion: string }[] = [
  { valor: "total", titulo: "Pago total", descripcion: "Cobra el precio completo del plan en un solo método de pago." },
  {
    valor: "abono",
    titulo: "Abono parcial",
    descripcion: "Recibe un monto menor al precio — el sistema calcula lo pendiente y hasta cuándo tiene acceso.",
  },
  {
    valor: "combinado",
    titulo: "Pago fraccionado",
    descripcion: "Divide el total entre varios métodos de pago, por ejemplo efectivo y punto de venta.",
  },
];

function ContenidoPaso2({
  miembro,
  planes,
  planElegidoId,
  onElegirPlan,
  tasaActual,
  modalidadElegida,
  onCambiarModalidad,
  entrenadores,
  metodosPago,
  accionCambiarPlan,
  onVolver,
  onContinuar,
  onCerrar,
}: {
  miembro: MiembroConPlan;
  planes: PlanParaModal[];
  planElegidoId: string | null;
  onElegirPlan: (id: string) => void;
  tasaActual: number | null;
  modalidadElegida: Modalidad;
  onCambiarModalidad: (modalidad: Modalidad) => void;
  entrenadores: EntrenadorParaCambio[];
  metodosPago: MetodoPago[];
  accionCambiarPlan: (estado: EstadoCambioPlan, formData: FormData) => Promise<EstadoCambioPlan>;
  onVolver: () => void;
  onContinuar: (plan: PlanParaModal) => void;
  onCerrar: () => void;
}) {
  // planElegidoId gana sobre miembro.plan cuando el cajero cambió el plan
  // explícitamente en este paso (ver diseño acordado, botón "Cambiar
  // plan") — antes miembro.plan siempre ganaba, así que un miembro que ya
  // tenía plan asignado no podía cambiarlo desde acá.
  const planEfectivo = (planElegidoId ? planes.find((p) => p.id === planElegidoId) : undefined) ?? miembro.plan;

  // Con ciclo vigente ya pagado, cambiar el plan cobra la diferencia (ver
  // diseño acordado — reusa el mismo flujo que la ficha del miembro,
  // FormularioCambiarPlan) en vez de solo reasignarlo para este pago.
  const tieneCicloVigente = miembro.fechaVencimiento !== null && miembro.fechaVencimiento > new Date();
  const [cambiandoPlan, setCambiandoPlan] = useState(false);
  // Resultado exacto (calcularCambioPlan, único camino) del plan nuevo
  // elegido dentro de FormularioCambiarPlan — corrige E6: antes este
  // cuadro usaba calcularProyeccionRenovacion (suma un ciclo al
  // vencimiento actual, SIN prorratear) incluso mientras se cambiaba de
  // plan, mostrando un número distinto al del formulario de abajo.
  const [proyeccionCambioPlan, setProyeccionCambioPlan] = useState<ProyeccionCambioPlan | null>(null);

  // Fuera del flujo de cambio de plan: la renovación normal del plan
  // vigente (sin prorrateo, correcto acá — no hay cambio de plan de por
  // medio) usa calcularProyeccionRenovacion como siempre.
  const proyeccionRenovacionNormal =
    !cambiandoPlan && planEfectivo ? calcularProyeccionRenovacion(miembro.fechaVencimiento, planEfectivo.diasCiclo) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 text-base lg:flex-row lg:gap-6">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-1 lg:overflow-y-auto lg:pr-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
            Plan y forma de pago
          </p>
          {miembro.plan && !cambiandoPlan && (
            <button
              type="button"
              onClick={() => {
                setCambiandoPlan(true);
                setProyeccionCambioPlan(null);
              }}
              className="min-h-9 shrink-0 rounded-lg border px-3 text-sm font-medium"
              style={{ borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
            >
              Cambiar plan
            </button>
          )}
        </div>
      {cambiandoPlan && tieneCicloVigente && miembro.plan ? (
        <div className="flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: "var(--gx-accent)" }}>
          <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
            Para subir o bajar de plan sin esperar a que venza el ciclo actual — el sistema prorratea el valor no
            consumido del ciclo contra el precio del plan nuevo y cobra o absorbe la diferencia automáticamente.
          </p>
          <FormularioCambiarPlan
            accion={accionCambiarPlan}
            miembroId={miembro.id}
            planes={planes}
            planActualId={miembro.plan.id}
            precioActual={miembro.plan.precioUSD}
            diasCicloActual={miembro.plan.diasCiclo}
            fechaVencimientoActual={miembro.fechaVencimiento ?? new Date()}
            metodosPago={metodosPago}
            entrenadores={entrenadores}
            entrenadorActualId={miembro.entrenadorId}
            origen="caja"
            onCambiado={onCerrar}
            onPlanNuevoCambiado={() => setProyeccionCambioPlan(null)}
            onProyeccionCambiada={setProyeccionCambioPlan}
          />
          <Button
            type="button"
            variant="secundario"
            onClick={() => {
              setCambiandoPlan(false);
              setProyeccionCambioPlan(null);
            }}
          >
            Cancelar
          </Button>
        </div>
      ) : planEfectivo && !cambiandoPlan ? (
        <div className="grid gap-4 rounded-xl border p-5 sm:grid-cols-3" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
          {[
            ["Plan", planEfectivo.nombre],
            ["Precio", `$${planEfectivo.precioUSD.toFixed(2)}/${ETIQUETA_FRECUENCIA[planEfectivo.frecuencia]}`],
            ...(tasaActual !== null ? [["Equivale a", `Bs. ${formatearBs(planEfectivo.precioUSD * tasaActual)}`]] : []),
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
                {etiqueta}
              </span>
              <span className="text-xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                {valor}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <label className="flex flex-col gap-2" style={{ color: "var(--gx-muted)" }}>
          {miembro.plan ? "Elegí el nuevo plan para este pago" : "Este miembro no tiene un plan asignado — elegí uno para continuar"}
          <div className="flex gap-2">
            <select
              value={planElegidoId ?? ""}
              onChange={(e) => onElegirPlan(e.target.value)}
              className="min-h-12 flex-1 rounded-lg border px-3 text-base outline-none focus:border-[var(--gx-accent)]"
              style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
            >
              <option value="">Seleccioná un plan</option>
              {planes.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.nombre} — ${plan.precioUSD.toFixed(2)}
                </option>
              ))}
            </select>
            {miembro.plan && (
              <Button
                type="button"
                variant="secundario"
                onClick={() => {
                  onElegirPlan("");
                  setCambiandoPlan(false);
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </label>
      )}

      {planEfectivo && planEfectivo.precioUSD > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
            Forma de pago
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {OPCIONES_MODALIDAD.map((opcion) => (
              <TarjetaOpcion
                key={opcion.valor}
                titulo={opcion.titulo}
                descripcion={opcion.descripcion}
                elegida={modalidadElegida === opcion.valor}
                deshabilitada={opcion.valor === "abono" && !planEfectivo.permitePagoParcial}
                onClick={() => onCambiarModalidad(opcion.valor)}
              />
            ))}
          </div>
          {!planEfectivo.permitePagoParcial && (
            <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
              Este plan no admite abonos — solo pago total o pago fraccionado.
            </p>
          )}
        </div>
      )}

      </div>
      <aside className="flex flex-col gap-4 lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:pl-6" style={{ borderColor: "var(--gx-edge)" }}>
        <CabeceraMiembro miembro={miembro} />
      <div className="flex justify-between">
        <span style={{ color: "var(--gx-muted)" }}>Vencimiento</span>
        <DiasDisponibles fechaVencimiento={miembro.fechaVencimiento} />
      </div>

      {miembro.saldoAFavorUSD > 0 && (
        <p
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: "color-mix(in srgb, var(--gx-accent) 15%, transparent)", color: "var(--gx-accent)" }}
        >
          Saldo a favor: ${miembro.saldoAFavorUSD.toFixed(2)} — se descuenta automáticamente del pago.
        </p>
      )}

      {/* Cambiando de plan: un solo pronóstico, el del único camino de
          cálculo — nunca el de renovación normal a la vez (corrige E6:
          antes se mostraban dos números distintos, sin prorrateo acá y
          prorrateado en el formulario). Sin plan nuevo elegido todavía, no
          se muestra nada. */}
      {cambiandoPlan && proyeccionCambioPlan && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--gx-accent)" }}>
          <p style={{ color: "var(--gx-ink)" }}>
            {proyeccionCambioPlan.resultado.montoCobradoCentavos > 0
              ? `Se cobra $${(proyeccionCambioPlan.resultado.montoCobradoCentavos / 100).toFixed(2)} — `
              : "Sin costo adicional — "}
            nuevo vencimiento{" "}
            <strong>{formatearFechaCorta(proyeccionCambioPlan.resultado.nuevoVencimiento)}</strong>.
          </p>
        </div>
      )}

      {!cambiandoPlan && proyeccionRenovacionNormal && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
          <p style={{ color: "var(--gx-ink)" }}>
            Al pagar la renovación, disfrutará de <strong>{proyeccionRenovacionNormal.diasDelPlan} días</strong>
            {proyeccionRenovacionNormal.adelantandoCuota && (
              <> ({proyeccionRenovacionNormal.diasTotalesTrasPago} días en total, incluyendo los días restantes)</>
            )}
            .
          </p>
          <p className="mt-2" style={{ color: "var(--gx-muted)" }}>
            Próximo vencimiento: {formatearFechaCorta(proyeccionRenovacionNormal.fechaProximoVencimiento)}
          </p>
        </div>
      )}

      <div className="mt-auto flex gap-3 pt-2">
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
      </aside>
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
  frecuenciaDelPlan,
  diasCiclo,
  permitePagoParcial,
  minimoAbonoTipo,
  minimoAbonoValor,
  fechaVencimiento,
  reglasAbono,
  modalidad,
  metodosPago,
  tasaActual: tasaVigente,
  deudaMiembro,
  ajustarFecha,
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
  frecuenciaDelPlan: FrecuenciaPago;
  diasCiclo: number;
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
  // Productos fiados pendientes de este miembro en la sucursal (null = no debe nada).
  deudaMiembro: GrupoDeudasMiembro | null;
  // El miembro tiene el aviso "Ajustar fecha o pago": se puede fechar el pago hacia atrás.
  ajustarFecha: boolean;
  onVolver: () => void;
  onPagoRegistrado: (fechaFinCicloISO: string | undefined) => void;
}) {
  const [estado, enviar, enviando] = useActionState(registrarPagoAction, {});
  // Fecha del pago (yyyy-mm-dd, "" = hoy). Con una fecha pasada, todo el cálculo en Bs usa la tasa BCV de ese día.
  const [fechaPago, setFechaPago] = useState("");
  const hoyISO = fechaALocalISO(new Date());
  const minFechaISO = fechaALocalISO(new Date(Date.now() - MAX_DIAS_ATRAS_PAGO_RETROACTIVO * 24 * 60 * 60 * 1000));
  const esFechaPasada = ajustarFecha && fechaPago !== "" && fechaPago < hoyISO;
  const [tasaDelDia, setTasaDelDia] = useState<number | null>(null);
  useEffect(() => {
    setTasaDelDia(null);
    if (!esFechaPasada) return;
    let vigente = true;
    fetch(`/api/tasa-cambio?fecha=${fechaPago}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((datos) => vigente && setTasaDelDia(datos?.valor ?? null));
    return () => {
      vigente = false;
    };
  }, [esFechaPasada, fechaPago]);
  const tasaActual = esFechaPasada ? tasaDelDia : tasaVigente;
  const { mostrarExito, mostrarError } = useFeedback();
  // Con deuda, la casilla "Cobrar también los productos pendientes" viene marcada.
  const [incluirDeudas, setIncluirDeudas] = useState(true);
  const [detalleDeudaAbierto, setDetalleDeudaAbierto] = useState(false);

  // El monto objetivo queda fijo al precio del plan siempre que la
  // modalidad NO admita variar el total: en "total" siempre, y en
  // "combinado" cuando el plan no permite abono (el pago combinado nunca
  // se restringe como modalidad, pero si el plan exige el 100%, el total
  // a distribuir entre métodos tampoco puede bajar de ahí — ver
  // AbonoNoPermitidoError en RegistrarPago.ts, hallazgo de la revisión final).
  // Deuda de productos a cobrar junto con la membresía (un plan de cortesía no la incluye). Lo que
  // se carga en las líneas es el total pagado: la parte de la membresía es lo que excede a la deuda.
  const deudaAPagar = montoSugerido > 0 && deudaMiembro && incluirDeudas && !esFechaPasada ? deudaMiembro.totalUSD : 0;
  const menosDeuda = (total: number) => Math.max(0, Math.round((total - deudaAPagar) * 100) / 100);

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
      ? menosDeuda(Number(lineaUnica.monto) || 0)
      : modalidad === "combinado"
        ? menosDeuda(sumaLineasCombinadas)
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
        : [{ ...lineaUnica, monto: String(Math.round((montoObjetivo + deudaAPagar) * 100) / 100) }];
  const sumaLineas = lineasActivas.reduce((suma, l) => suma + (Number(l.monto) || 0), 0);

  // Réplica cliente del motor de reglas de abono (proyeccionAbono.ts) —
  // misma fecha base que calcularProyeccionRenovacion (Paso 2): el ciclo
  // vigente si no venció, o ahora mismo si ya venció/nunca pagó.
  const ahora = new Date();
  const fechaInicioCicloEstimada =
    fechaVencimiento !== null && fechaVencimiento > ahora ? fechaVencimiento : ahora;
  const proyeccionAbono = calcularProyeccionAbono(
    { minimoAbonoTipo, minimoAbonoValor, frecuencia: frecuenciaDelPlan, diasCiclo, precioUSD: montoSugerido },
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

  // Las líneas traen lo que el cliente paga en total (membresía + deuda): el servidor descuenta
  // la deuda primero y en orden, y lo que sobra es la membresía.
  const lineasParaEnviar = lineasActivas
    .filter((l) => Number(l.monto) > 0)
    .map((l) => ({
      monto: Math.round(Number(l.monto) * 100) / 100,
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
    : montoSugerido === 0 || (lineasParaEnviar.length > 0 && montoObjetivo > 0 && lineasParaEnviar.every((l) => l.metodoPagoId));

  return (
    <form action={enviar} className="flex min-h-0 flex-1 flex-col gap-4 text-base lg:flex-row lg:gap-6">
      <input type="hidden" name="miembroId" value={miembroId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="origen" value="caja" />
      {esFechaPasada && <input type="hidden" name="fechaPago" value={fechaPago} />}
      {deudaAPagar > 0 && <input type="hidden" name="incluirDeudas" value="1" />}
      <input
        type="hidden"
        name="lineas"
        value={JSON.stringify(
          montoSugerido === 0
            ? [{ monto: 0, metodo: "Cortesía", metodoPagoId: null, numeroOperacion: null, tasaCambio: null }]
            : lineasParaEnviar
        )}
      />

      <div className="flex min-w-0 flex-col gap-4 lg:flex-1 lg:overflow-y-auto lg:pr-2">
      {ajustarFecha && (
        <div className="flex flex-col gap-2 rounded-xl border p-4" style={{ borderColor: "var(--gx-warn)" }}>
          <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
            Fecha del pago (aviso "Ajustar fecha o pago")
            <input
              type="date"
              value={fechaPago}
              min={minFechaISO}
              max={hoyISO}
              onChange={(e) => setFechaPago(e.target.value)}
              className="titilar-fecha min-h-11 w-48 rounded-lg border px-3 outline-none"
              style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
            />
          </label>
          <p className="text-xs" style={{ color: "var(--gx-muted)" }}>
            {esFechaPasada
              ? tasaDelDia !== null
                ? `El pago se registra el ${fechaPago.split("-").reverse().join("/")} con la tasa BCV de ese día (Bs. ${tasaDelDia}); no entra en ningún turno de caja y no admite abonos.`
                : "Buscando la tasa BCV de esa fecha…"
              : "Déjala vacía para registrar el pago hoy. Si eliges una fecha anterior, se usa la tasa BCV de ese día."}
          </p>
        </div>
      )}
      {/* Abono: el método se elige ANTES que el monto (ver diseño acordado) — se le pasa el precio
          del plan como referencia para la tasa en Bs, no como monto a cobrar. El monto a abonar y
          el número de operación viven en la tarjeta de la derecha. USD es la fuente de verdad;
          escribir en Bs solo recalcula el USD. */}
      {esAbono && montoSugerido > 0 && (
        <MetodoYCampos
          vacio="Elegí un método de pago para ingresar el monto a abonar."
          selector={
            <SelectorMetodoPago
              compacto
              fechaTasa={esFechaPasada ? fechaPago : undefined}
              metodos={metodosPago}
              monto={montoSugerido + deudaAPagar}
              onCambio={(seleccion) =>
                setLineaUnica((prev) => {
                  // Cambiar de método en Bs a uno en USD (o viceversa) invalida la casilla Bs auxiliar.
                  if (seleccion.tasaCambio === null) setMontoAbonoBsTexto("");
                  return { ...prev, seleccion };
                })
              }
              grande
              avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
              ocultarNumeroOperacion
              numeroOperacion={lineaUnica.seleccion.numeroOperacion}
              onCambioNumeroOperacion={(valor) =>
                setLineaUnica((prev) => ({ ...prev, seleccion: { ...prev.seleccion, numeroOperacion: valor } }))
              }
            />
          }
          campos={
            metodoAbonoElegido && (
              <>
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
                {requiereNumeroOperacionAbono && (
                  <CampoNumeroOperacion
                    value={lineaUnica.seleccion.numeroOperacion}
                    onChange={(valor) =>
                      setLineaUnica((prev) => ({ ...prev, seleccion: { ...prev.seleccion, numeroOperacion: valor } }))
                    }
                  />
                )}
              </>
            )
          }
        />
      )}

      {/* La proyección + detalle de ciclos del abono ya NO se muestra acá
          dentro del modal — se desacopló al panel flotante (PanelRemanentePago),
          visible para las 3 modalidades sin saturar/refrescar el modal
          (ver diseño acordado). */}

      {montoObjetivo > 0 && !esAbono && modalidad !== "combinado" && (
        <MetodoYCampos
          vacio={lineaUnica.seleccion.metodoPagoId ? "Este método no requiere número de operación." : "Elegí un método de pago."}
          selector={
            <SelectorMetodoPago
              compacto
              fechaTasa={esFechaPasada ? fechaPago : undefined}
              metodos={metodosPago}
              monto={montoObjetivo + deudaAPagar}
              onCambio={(seleccion) => setLineaUnica((prev) => ({ ...prev, monto: String(montoObjetivo + deudaAPagar), seleccion }))}
              grande
              avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
              ocultarNumeroOperacion
              numeroOperacion={lineaUnica.seleccion.numeroOperacion}
              onCambioNumeroOperacion={(valor) =>
                setLineaUnica((prev) => ({ ...prev, seleccion: { ...prev.seleccion, numeroOperacion: valor } }))
              }
            />
          }
          campos={
            lineaUnica.seleccion.requiereNumeroOperacion && (
              <CampoNumeroOperacion
                value={lineaUnica.seleccion.numeroOperacion}
                onChange={(valor) =>
                  setLineaUnica((prev) => ({ ...prev, seleccion: { ...prev.seleccion, numeroOperacion: valor } }))
                }
              />
            )
          }
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
                <div className={`flex flex-col gap-3 border-t p-4 ${expandida ? "" : "hidden"}`} style={{ borderColor: "var(--gx-edge)" }}>
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

                    <MetodoYCampos
                      vacio="Elegí un método de pago para ingresar el monto de esta fracción."
                      selector={
                        <SelectorMetodoPago
                          compacto
                          fechaTasa={esFechaPasada ? fechaPago : undefined}
                          metodos={metodosPago}
                          monto={montoLinea > 0 ? montoLinea : montoSugerido + deudaAPagar}
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
                      }
                      campos={
                        linea.seleccion.metodoPagoId !== null && (
                          <>
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
                            {linea.seleccion.requiereNumeroOperacion && (
                              <CampoNumeroOperacion
                                value={linea.seleccion.numeroOperacion}
                                onChange={(valor) =>
                                  setLineasCombinadas((prev) =>
                                    prev.map((l, i) => (i === indice ? { ...l, seleccion: { ...l.seleccion, numeroOperacion: valor } } : l))
                                  )
                                }
                              />
                            )}
                          </>
                        )
                      }
                    />
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
            className="min-h-11 w-fit rounded-lg border px-4 text-sm font-medium"
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

      {montoSugerido === 0 && (
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          Este plan no tiene costo — no hace falta elegir método de pago.
        </p>
      )}

      </div>
      <aside className="flex flex-col gap-4 lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:pl-6" style={{ borderColor: "var(--gx-edge)" }}>
      {montoSugerido > 0 && deudaMiembro && (
        <div
          className="flex flex-col gap-2 rounded-lg border-2 px-3 py-3"
          style={{ borderColor: "var(--gx-warn)", background: "color-mix(in srgb, var(--gx-warn) 8%, transparent)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold" style={{ color: "var(--gx-ink)" }}>
              <Badge tono="ambar">Deuda pendiente</Badge>
              Debe ${deudaMiembro.totalUSD.toFixed(2)} en productos
            </span>
            <button
              type="button"
              onClick={() => setDetalleDeudaAbierto(true)}
              className="text-sm font-medium hover:underline"
              style={{ color: "var(--gx-accent)" }}
            >
              Ver detalles
            </button>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-ink)" }}>
            <input
              type="checkbox"
              checked={incluirDeudas}
              onChange={(e) => setIncluirDeudas(e.target.checked)}
              className="h-5 w-5 accent-[var(--gx-accent)]"
            />
            Cobrar también los productos pendientes
          </label>
          {incluirDeudas && (
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span style={{ color: "var(--gx-muted)" }}>
                Membresía ${montoObjetivo.toFixed(2)} + productos ${deudaMiembro.totalUSD.toFixed(2)}
              </span>
              <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
                Total ${(montoObjetivo + deudaMiembro.totalUSD).toFixed(2)}
                {tasaActual !== null && ` · Bs. ${formatearBs((montoObjetivo + deudaMiembro.totalUSD) * tasaActual)}`}
              </span>
            </div>
          )}
        </div>
      )}
      {detalleDeudaAbierto && deudaMiembro && (
        <ModalDetalleDeuda grupo={deudaMiembro} tasaActual={tasaActual} onCerrar={() => setDetalleDeudaAbierto(false)} />
      )}

      {/* Panel flotante — desacoplado del modal para las 3 modalidades (ver
          diseño acordado: evita saturar/refrescar el modal). En Total y
          Abono, lineasActivas ya resuelve a una sola línea equivalente
          (ver definición arriba); en Fraccionado, a las N fracciones. */}
      {montoSugerido > 0 && (
        <PanelRemanentePago
          acoplado
          lineas={lineasActivas.map((l) => ({ metodo: l.seleccion.metodo, monto: Number(l.monto) || 0 }))}
          // El objetivo real a cubrir es el precio del plan — montoObjetivo
          // ya ES la suma de las fracciones en Fraccionado (ver diseño
          // acordado), así que compararlo contra sí mismo siempre daría
          // remanente $0. En Total/Abono también es el precio del plan.
          montoObjetivo={montoSugerido}
          tasaReferencia={lineasActivas.find((l) => l.seleccion.tasaCambio !== null)?.seleccion.tasaCambio ?? null}
          // Proyección + detalle de períodos, siempre visible (ver diseño
          // acordado: "que el cliente vea que cubre su pago"), calculada
          // sobre la SUMA de todas las líneas activas — se actualiza en vivo.
          proyeccion={sumaLineas > 0 && montoObjetivo > 0 ? proyeccionAbono : null}
          modalidad={modalidad}
          deudaProductos={deudaAPagar}
        />
      )}

      <div className="mt-auto flex gap-3 pt-2">
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
      </aside>
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
  entrenadores,
  accionCambiarPlan,
  miembroInicialId,
  deudas,
  onCerrar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  reglasAbono: ReglaAbonoPorFrecuencia[];
  entrenadores: EntrenadorParaCambio[];
  accionCambiarPlan: (estado: EstadoCambioPlan, formData: FormData) => Promise<EstadoCambioPlan>;
  // Miembro ya identificado (ej. "Cobrar ahora" desde /en-sala): se salta el Paso 1.
  miembroInicialId?: string;
  // Productos fiados pendientes por miembro (sucursal activa), para ofrecer cobrarlos junto con la membresía.
  deudas: GrupoDeudasMiembro[];
  onCerrar: () => void;
}) {
  const [miembroInicial] = useState(() => {
    const encontrado = miembroInicialId ? miembros.find((m) => m.id === miembroInicialId) : undefined;
    return encontrado ? aMiembroConPlan(encontrado, new Map(planes.map((p) => [p.id, p]))) : null;
  });
  const [paso, setPaso] = useState<Paso>(miembroInicial ? 2 : 1);
  const [miembroElegido, setMiembroElegido] = useState<MiembroConPlan | null>(miembroInicial);
  const [planElegidoId, setPlanElegidoId] = useState<string | null>(null);
  const [modalidadElegida, setModalidadElegida] = useState<Modalidad>("total");
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [fechaFinCicloFinal, setFechaFinCicloFinal] = useState<Date | null>(null);

  // Pasos 2 y 3: el asistente ocupa el 98% de la pantalla, con columna lateral de contexto, para no hacer scroll.
  const ancho = paso === 2 || paso === 3;

  function pedirCierre() {
    if (paso === 1 || paso === 4) {
      onCerrar();
      return;
    }
    setConfirmandoCierre(true);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${ancho ? "p-[1%]" : "p-4"}`}
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Registrar pago"
      onClick={pedirCierre}
    >
      <div
        className={`flex w-full flex-col text-base ${ancho ? "h-full overflow-y-auto rounded-2xl border-2 p-4 lg:overflow-hidden lg:p-6" : "max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-2 p-8"}`}
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

        <BarraProgreso paso={paso} compacta={ancho} />

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
            entrenadores={entrenadores}
            metodosPago={metodosPago}
            accionCambiarPlan={accionCambiarPlan}
            onCerrar={onCerrar}
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
              (planes.find((p) => p.id === planElegidoId) ?? miembroElegido.plan)?.precioUSD ?? 0
            }
            frecuenciaDelPlan={
              (planes.find((p) => p.id === planElegidoId) ?? miembroElegido.plan)?.frecuencia ?? "MENSUAL"
            }
            diasCiclo={
              (planes.find((p) => p.id === planElegidoId) ?? miembroElegido.plan)?.diasCiclo ?? 30
            }
            permitePagoParcial={
              (planes.find((p) => p.id === planElegidoId) ?? miembroElegido.plan)?.permitePagoParcial ?? true
            }
            minimoAbonoTipo={
              (planes.find((p) => p.id === planElegidoId) ?? miembroElegido.plan)?.minimoAbonoTipo ?? null
            }
            minimoAbonoValor={
              (planes.find((p) => p.id === planElegidoId) ?? miembroElegido.plan)?.minimoAbonoValor ?? null
            }
            fechaVencimiento={miembroElegido.fechaVencimiento}
            reglasAbono={reglasAbono}
            modalidad={modalidadElegida}
            metodosPago={metodosPago}
            deudaMiembro={deudas.find((g) => g.miembroId === miembroElegido.id) ?? null}
            ajustarFecha={miembroElegido.ajustarFecha}
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
              (planes.find((p) => p.id === planElegidoId) ?? miembroElegido.plan)?.nombre ?? "—"
            }
            fechaFinCiclo={fechaFinCicloFinal}
            onCerrar={onCerrar}
          />
        )}
      </div>
    </div>
  );
}
