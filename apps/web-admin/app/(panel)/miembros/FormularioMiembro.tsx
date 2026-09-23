"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import { Card } from "@gym-app/ui/components/Card";
import { Badge } from "@gym-app/ui/components/Badge";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { EstadoFormularioMiembro } from "./actions";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { formatearBs } from "../tasaBcvFija";
import type { EntrenadorResumen } from "@gym-app/domain/entities/EntrenadorResumen";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import type { Plan, FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";

export interface ValoresFormularioMiembro {
  nombre: string;
  cedula: string;
  celular: string;
  fechaInscripcion: string; // yyyy-mm-dd
  sucursalId: string | null; // null = "Ambas"
  planId: string | null;
  precioPlan: number;
  entrenadorId: string | null;
  fotoUrl: string | null;
}

const ID_AMBAS_SEDES = "__ambas__";

const ETIQUETA_FRECUENCIA: Record<FrecuenciaPago, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

// OJO: nunca usar fecha.toISOString() acá — convierte a UTC primero, y de
// noche (pasadas las 8pm en Venezuela, UTC-4) eso salta al día siguiente.
function hoyISO(): string {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function formatearFecha(fechaISO: string): string {
  if (!fechaISO) return "—";
  const [anio, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}/${anio}`;
}

function formatearFechaCorta(fecha: Date): string {
  return new Date(fecha).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt style={{ color: "var(--gx-muted)" }}>{label}</dt>
      <dd className="text-right font-medium" style={{ color: "var(--gx-ink)" }}>
        {valor}
      </dd>
    </div>
  );
}

export function FormularioMiembro({
  accion,
  entrenadoresPorSucursal,
  sucursales,
  sucursalActivaNombre,
  sucursalIdDefault,
  planes,
  metodosPago,
  miembroId,
  ultimosCiclos,
  valoresIniciales,
  tieneCicloVigente,
  panelLateral,
}: {
  accion: (estado: EstadoFormularioMiembro, formData: FormData) => Promise<EstadoFormularioMiembro>;
  // Entrenadores disponibles por cada sucursal visible — el elegible
  // depende de la sucursal seleccionada en el propio formulario, así que
  // se filtra en el cliente sin ida y vuelta al servidor.
  entrenadoresPorSucursal: Record<string, EntrenadorResumen[]>;
  // Se sigue usando para resolver entrenadoresDeLaSede y para mostrar el
  // nombre cuando sucursalId === ID_AMBAS_SEDES; ya NO se usa para poblar
  // un <select> de sedes.
  sucursales: SucursalResumen[];
  // Nombre de la sucursal activa de la sesión — se muestra como texto fijo
  // en vez de ofrecer un selector (ver diseño acordado: crear/editar un
  // miembro siempre lo asigna a la sede activa, salvo "Ambas").
  sucursalActivaNombre: string;
  sucursalIdDefault: string | null;
  planes: Plan[];
  metodosPago: MetodoPago[];
  // null solo en modo creación (no hay ficha de ciclos que enlazar
  // todavía). En modo edición siempre es el id real del miembro.
  miembroId: string | null;
  // Últimos 3-5 pagos del miembro que tienen datos de ciclo (pagos
  // previos a esta funcionalidad no tienen fechaInicioCiclo/
  // fechaFinCiclo y no aparecen aquí) — solo se usa en modo edición.
  ultimosCiclos: { id: string; fechaInicioCiclo: Date | null; fechaFinCiclo: Date | null }[];
  valoresIniciales?: ValoresFormularioMiembro;
  // Mientras el ciclo actual esté vigente, cambiar de plan gratis desde acá
  // quedaría pisado por "Cambiar de plan" del panel derecho (que sí cobra
  // la diferencia) — se oculta el editor de plan acá para no tener dos
  // botones "Cambiar plan" haciendo cosas distintas al mismo tiempo (ver
  // diseño acordado). Solo relevante en edición; en alta siempre es true.
  tieneCicloVigente?: boolean;
  // Contenido propio de la pantalla de edición (dar de baja, historial de
  // pagos, registrar pago) — se muestra en el panel derecho cuando no hay
  // ticket de confirmación abierto, para no tener que scrollear.
  panelLateral?: React.ReactNode;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const esEdicion = !!valoresIniciales;
  const formRef = useRef<HTMLFormElement>(null);
  const { mostrarError } = useFeedback();

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  const [nombre, setNombre] = useState(valoresIniciales?.nombre ?? "");
  const [cedula, setCedula] = useState(valoresIniciales?.cedula ?? "");
  const [celular, setCelular] = useState(valoresIniciales?.celular ?? "");
  const [fechaInscripcion, setFechaInscripcion] = useState(valoresIniciales?.fechaInscripcion ?? hoyISO());
  const [sucursalId, setSucursalId] = useState(
    valoresIniciales ? (valoresIniciales.sucursalId ?? ID_AMBAS_SEDES) : sucursalIdDefault ?? ""
  );
  const [entrenadorId, setEntrenadorId] = useState(valoresIniciales?.entrenadorId ?? "");
  const [fotoPreview, setFotoPreview] = useState<string | null>(valoresIniciales?.fotoUrl ?? null);

  // Si la sucursal o el plan actuales del miembro ya no están entre las
  // opciones visibles (p. ej. un plan que se dio de baja, o una sucursal
  // fuera del alcance del usuario que edita), se agregan igual a la lista
  // para no perder el dato al mostrar el formulario.
  const sucursalesConActual =
    valoresIniciales && valoresIniciales.sucursalId && !sucursales.some((s) => s.id === valoresIniciales.sucursalId)
      ? [...sucursales, { id: valoresIniciales.sucursalId, nombre: "(sede actual)", direccion: null, diasGracia: 0, activo: true }]
      : sucursales;

  const planesActivos = planes.filter(
    (plan) => plan.activo || (valoresIniciales && plan.id === valoresIniciales.planId)
  );

  // Entrenadores elegibles según la sucursal actualmente seleccionada. Si
  // el entrenador ya asignado no está en esa lista (p. ej. se cambió de
  // sede, o el entrenador dejó de tener esa sucursal asignada), se agrega
  // igual para no perder el dato al mostrar el formulario de edición.
  const entrenadoresDeLaSede =
    sucursalId === ID_AMBAS_SEDES
      ? Object.values(entrenadoresPorSucursal)
          .flat()
          .filter((e, i, lista) => lista.findIndex((otro) => otro.id === e.id) === i)
      : entrenadoresPorSucursal[sucursalId] ?? [];
  const entrenadores =
    valoresIniciales?.entrenadorId && !entrenadoresDeLaSede.some((e) => e.id === valoresIniciales.entrenadorId)
      ? [...entrenadoresDeLaSede, { id: valoresIniciales.entrenadorId, nombre: "(entrenador actual)" }]
      : entrenadoresDeLaSede;

  const [planId, setPlanId] = useState<string>(() => {
    if (!valoresIniciales) return planesActivos[0]?.id ?? "";
    return valoresIniciales.planId ?? "";
  });
  const [precio, setPrecio] = useState<string>(String(valoresIniciales?.precioPlan ?? ""));
  const [errorPrecio, setErrorPrecio] = useState<string | null>(null);
  const [seleccionMetodo, setSeleccionMetodo] = useState<{
    metodoPagoId: string | null;
    metodo: string;
    tasaCambio: number | null;
    numeroOperacion: string;
  }>({ metodoPagoId: null, metodo: "", tasaCambio: null, numeroOperacion: "" });
  const [mostrarTicket, setMostrarTicket] = useState(false);
  // Mientras el ciclo actual esté vigente, el cambio de plan gratis queda
  // deshabilitado acá — usa "Cambiar de plan" del panel derecho, que cobra
  // la diferencia correspondiente (ver diseño acordado).
  const puedeCambiarPlanGratis = !esEdicion || !tieneCicloVigente;
  // En edición, el plan asignado se ve de solo lectura hasta que se
  // confirma explícitamente que se quiere cambiar (ver diseño acordado:
  // evita cambios de plan por error, ya que dispara el prorrateo).
  const [editandoPlan, setEditandoPlan] = useState(!esEdicion);
  const [confirmandoCambioPlan, setConfirmandoCambioPlan] = useState(false);
  const planIdOriginal = valoresIniciales?.planId ?? null;
  // El entrenador también se ve de solo lectura en edición — se asigna en
  // la inscripción, cambiarlo es una acción explícita aparte (ver diseño
  // acordado). La sede ya no tiene modo edición propio — la única
  // alternativa a la sede activa es el toggle de "Ambas sedes" (ver bloque
  // "Sede asignada" más abajo).
  const [editandoEntrenador, setEditandoEntrenador] = useState(!esEdicion);
  const entrenadorIdOriginal = valoresIniciales?.entrenadorId ?? "";

  const planSeleccionado = planesActivos.find((p) => p.id === planId);

  const requiereEntrenador = planSeleccionado?.incluyeEntrenador ?? false;
  const precioActual = Number(precio) || 0;
  const nombrePlanActual = planSeleccionado?.nombre ?? "—";
  const nombreEntrenadorActual = entrenadores.find((e) => e.id === entrenadorId)?.nombre ?? null;
  const nombreMetodoPagoActual = seleccionMetodo.metodo || null;
  // El ciclo más reciente (por fechaFinCiclo) entre los que tienen datos
  // de ciclo — su fechaInicioCiclo es la "última fecha de renovación", y
  // su fechaFinCiclo es la fecha de vencimiento vigente (próximo cobro).
  const cicloMasReciente = ultimosCiclos.find((c) => c.fechaInicioCiclo && c.fechaFinCiclo) ?? null;
  const ultimaFechaRenovacion = cicloMasReciente?.fechaInicioCiclo ?? null;
  // Días hasta el próximo cobro — negativo si ya venció. Se redondea con
  // ceil sobre el delta en horas para no perder un día por horas sueltas
  // (p. ej. faltan 23h50m -> "falta 1 día", no "0 días").
  const diasHastaProximoCobro = cicloMasReciente?.fechaFinCiclo
    ? Math.ceil((new Date(cicloMasReciente.fechaFinCiclo).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Si se cambia de sede y el entrenador seleccionado no está entre los
  // elegibles de la nueva sede, se limpia la selección en vez de dejar un
  // entrenadorId "fantasma" que el usuario ya no ve en el select.
  useEffect(() => {
    if (entrenadorId && !entrenadores.some((e) => e.id === entrenadorId)) {
      setEntrenadorId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe re-evaluar cuando cambia la sede, no en cada render de `entrenadores`
  }, [sucursalId]);
  const montoBsActual = seleccionMetodo.tasaCambio !== null ? precioActual * seleccionMetodo.tasaCambio : null;

  function manejarCambioPlan(nuevoId: string) {
    setPlanId(nuevoId);
    const plan = planesActivos.find((p) => p.id === nuevoId);
    const permiteMultisede = plan?.multisede ?? false;
    if (plan) setPrecio(String(plan.precioUSD));
    // Si el nuevo plan no permite multisede y había quedado "Ambas"
    // seleccionado, se cae a la primera sede visible en vez de dejar un
    // valor que ya no es válido para este plan.
    if (!permiteMultisede && sucursalId === ID_AMBAS_SEDES) {
      setSucursalId(sucursalIdDefault ?? "");
    }
  }

  const planPermiteMultisede = planesActivos.find((p) => p.id === planId)?.multisede ?? false;

  function manejarClickGuardar() {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;

    if (!precio || Number(precio) <= 0) {
      setErrorPrecio("Ingresá un precio válido.");
      return;
    }

    setErrorPrecio(null);
    setMostrarTicket(true);
  }

  function manejarCambioFoto(archivo: File | undefined) {
    if (!archivo) return;
    setFotoPreview(URL.createObjectURL(archivo));
  }

  const idFormulario = "formulario-miembro";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <form ref={formRef} id={idFormulario} action={enviar} className="flex flex-col gap-6">
        {estado.error && (
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
          >
            {estado.error}
          </p>
        )}

        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="precioPlan" value={precioActual} />
        <input type="hidden" name="planNombre" value={nombrePlanActual} />
        {!esEdicion && (
          <>
            <input type="hidden" name="metodo" value={seleccionMetodo.metodo} />
            <input type="hidden" name="metodoPagoId" value={seleccionMetodo.metodoPagoId ?? ""} />
            <input type="hidden" name="tasaCambio" value={seleccionMetodo.tasaCambio ?? ""} />
            <input type="hidden" name="numeroOperacion" value={seleccionMetodo.numeroOperacion} />
          </>
        )}

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
            Datos personales
          </h2>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold"
                style={{ background: "var(--gx-surface-2)", color: "var(--gx-muted)" }}
              >
                {fotoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo elegido en el cliente, no un asset del proyecto
                  <img src={fotoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  iniciales(nombre || "?")
                )}
              </div>

              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
                Foto de perfil
                <input
                  type="file"
                  name="foto"
                  accept="image/*"
                  onChange={(e) => manejarCambioFoto(e.target.files?.[0])}
                  className="text-sm file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                  style={{ color: "var(--gx-muted)" }}
                />
                <span className="text-xs" style={{ color: "var(--gx-muted-dim)" }}>
                  Es la foto que va a aparecer en la ficha al ingresar su cédula.
                </span>
              </label>
            </div>

            <Input
              name="nombre"
              label="Nombre"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                name="cedula"
                label="Cédula"
                required
                disabled={esEdicion}
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
              />
              <Input
                name="celular"
                label="Celular"
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
              />
            </div>

            <Input
              name="fechaInscripcion"
              label="Fecha de inscripción"
              type="date"
              required
              value={fechaInscripcion}
              onChange={(e) => setFechaInscripcion(e.target.value)}
            />
          </div>
        </Card>

        {esEdicion && ultimosCiclos.length > 0 && (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
                Ciclos
              </h2>
              {diasHastaProximoCobro !== null && (
                <Badge tono={diasHastaProximoCobro < 0 ? "rojo" : diasHastaProximoCobro <= 3 ? "ambar" : "verde"}>
                  {diasHastaProximoCobro < 0
                    ? `Vencido hace ${Math.abs(diasHastaProximoCobro)} día${Math.abs(diasHastaProximoCobro) === 1 ? "" : "s"}`
                    : diasHastaProximoCobro === 0
                      ? "Vence hoy"
                      : `${diasHastaProximoCobro} día${diasHastaProximoCobro === 1 ? "" : "s"} para el próximo cobro`}
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {ultimosCiclos.map((ciclo, indice) => (
                <div
                  key={ciclo.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                  style={{ borderColor: "var(--gx-edge)" }}
                >
                  <span style={{ color: "var(--gx-ink)" }}>
                    {ciclo.fechaInicioCiclo && ciclo.fechaFinCiclo
                      ? `${formatearFechaCorta(ciclo.fechaInicioCiclo)} → ${formatearFechaCorta(ciclo.fechaFinCiclo)}`
                      : "—"}
                  </span>
                  <Badge tono={indice === 0 ? "verde" : "gris"}>{indice === 0 ? "VIGENTE" : "VENCIDO"}</Badge>
                </div>
              ))}
            </div>
            {miembroId && (
              <Link
                href={`/miembros/${miembroId}/pagos`}
                className="mt-3 inline-block text-sm font-medium hover:underline"
                style={{ color: "var(--gx-accent)" }}
              >
                Ver todos los ciclos
              </Link>
            )}
          </Card>
        )}

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
              Plan de membresía
            </h2>
            <div className="flex gap-2">
              {esEdicion && !editandoEntrenador && (
                <Button type="button" variant="secundario" onClick={() => setEditandoEntrenador(true)}>
                  Cambiar entrenador
                </Button>
              )}
              {esEdicion && !editandoPlan && puedeCambiarPlanGratis && (
                <Button type="button" variant="secundario" onClick={() => setConfirmandoCambioPlan(true)}>
                  Cambiar plan
                </Button>
              )}
            </div>
          </div>

          <div className="mb-4 rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
            <input type="hidden" name="sucursalId" value={sucursalId} />
            <div className="flex justify-between text-sm">
              <span style={{ color: "var(--gx-muted)" }}>Sede asignada</span>
              <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                {sucursalId === ID_AMBAS_SEDES ? "Ambas" : sucursalActivaNombre}
              </span>
            </div>
            {planPermiteMultisede && (
              <label className="mt-3 flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
                <input
                  type="checkbox"
                  checked={sucursalId === ID_AMBAS_SEDES}
                  onChange={(e) => setSucursalId(e.target.checked ? ID_AMBAS_SEDES : sucursalIdDefault ?? "")}
                  className="h-5 w-5 accent-[var(--gx-accent)]"
                />
                Disponible en ambas sedes
              </label>
            )}
            <span className="mt-2 block text-xs" style={{ color: "var(--gx-muted-dim)" }}>
              {sucursalId === ID_AMBAS_SEDES
                ? "Puede hacer check-in en cualquier sucursal de la organización."
                : "Determina en qué sucursal puede hacer check-in."}
            </span>
          </div>

          {esEdicion && !editandoPlan && (
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium" style={{ color: "var(--gx-muted)" }}>
                  {nombrePlanActual}
                </span>
                <span className="text-2xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                  ${precioActual}
                  {planSeleccionado && (
                    <span className="text-sm font-normal" style={{ color: "var(--gx-muted)" }}>
                      /{ETIQUETA_FRECUENCIA[planSeleccionado.frecuencia].toLowerCase()}
                    </span>
                  )}
                </span>
              </div>
              {requiereEntrenador && (
                <p className="mt-1 text-xs font-medium" style={{ color: "var(--gx-accent)" }}>
                  Entrenador: {nombreEntrenadorActual ?? "Sin asignar"}
                </p>
              )}
              <div className="mt-2 flex justify-between text-xs" style={{ color: "var(--gx-muted)" }}>
                <span>Última fecha de renovación</span>
                <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                  {ultimaFechaRenovacion ? formatearFechaCorta(ultimaFechaRenovacion) : "—"}
                </span>
              </div>
              {!puedeCambiarPlanGratis && (
                <p className="mt-2 text-xs" style={{ color: "var(--gx-muted)" }}>
                  Este ciclo ya está pagado — para subir o bajar de plan usá &quot;Cambiar de plan&quot; en el panel
                  de la derecha.
                </p>
              )}
            </div>
          )}

          {confirmandoCambioPlan && !editandoPlan && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
            >
              <div
                className="w-full max-w-sm rounded-2xl border-2 p-6"
                style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
              >
                <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
                  ¿Cambiar el plan?
                </h3>
                <p className="mt-2 text-sm" style={{ color: "var(--gx-muted)" }}>
                  Se va a cambiar el plan de membresía. Si el miembro tiene una suscripción activa, su fecha de
                  vencimiento se recalcula (prorrateo) a la nueva frecuencia. ¿Estás seguro?
                </p>
                <div className="mt-4 flex gap-3">
                  <Button
                    type="button"
                    variant="secundario"
                    className="flex-1"
                    onClick={() => setConfirmandoCambioPlan(false)}
                  >
                    Abortar
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => {
                      setConfirmandoCambioPlan(false);
                      setEditandoPlan(true);
                    }}
                  >
                    Sí, cambiar plan
                  </Button>
                </div>
              </div>
            </div>
          )}

          {editandoPlan && (
          <div className="grid grid-cols-2 gap-3">
            {planesActivos.map((plan) => {
              const seleccionado = planId === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => manejarCambioPlan(plan.id)}
                  className="flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors duration-150 active:scale-[0.98]"
                  style={
                    seleccionado
                      ? {
                          borderColor: "var(--gx-accent)",
                          background: "color-mix(in srgb, var(--gx-accent) 12%, transparent)",
                        }
                      : { borderColor: "var(--gx-edge)" }
                  }
                >
                  <span className="text-sm font-medium" style={{ color: "var(--gx-muted)" }}>
                    {plan.nombre}
                  </span>
                  <span className="text-2xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                    ${plan.precioUSD}
                    <span className="text-sm font-normal" style={{ color: "var(--gx-muted)" }}>
                      /{ETIQUETA_FRECUENCIA[plan.frecuencia].toLowerCase()}
                    </span>
                  </span>
                  {plan.incluyeEntrenador && (
                    <span className="text-xs font-medium" style={{ color: "var(--gx-accent)" }}>
                      Incluye entrenador
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          )}

          {editandoPlan && (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
            <CurrencyInput
              name="precioPlanEditado"
              label="Precio"
              moneda="USD"
              value={precio}
              onChange={(valor) => {
                setPrecio(valor);
                setErrorPrecio(null);
              }}
            />
            {errorPrecio && (
              <p className="text-sm" style={{ color: "var(--gx-bad)" }}>
                {errorPrecio}
              </p>
            )}
          </div>
          )}

          <label className="mt-4 flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
            Entrenador asignado
            {(() => {
              const bloqueado = !requiereEntrenador || (esEdicion && !editandoPlan && !editandoEntrenador);
              return (
                <>
                  {/* Un <select disabled> no se envía en el submit — cuando está
                      bloqueado se manda su valor actual por un hidden aparte,
                      así no se pisa el entrenadorId existente con null. */}
                  {bloqueado && <input type="hidden" name="entrenadorId" value={entrenadorId} />}
                  <select
                    name={bloqueado ? undefined : "entrenadorId"}
                    value={entrenadorId}
                    onChange={(e) => setEntrenadorId(e.target.value)}
                    disabled={bloqueado}
                    className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)] disabled:opacity-50"
                    style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                  >
                    <option value="">Seleccioná un entrenador</option>
                    {entrenadores.map((entrenador) => (
                      <option key={entrenador.id} value={entrenador.id}>
                        {entrenador.nombre}
                      </option>
                    ))}
                  </select>
                </>
              );
            })()}
            {!requiereEntrenador && (
              <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
                Elegí un plan con entrenador para poder asignar uno.
              </span>
            )}
            {esEdicion && editandoEntrenador && !editandoPlan && (
              <Button
                type="button"
                variant="secundario"
                className="mt-1 self-start"
                onClick={() => {
                  setEntrenadorId(entrenadorIdOriginal);
                  setEditandoEntrenador(false);
                }}
              >
                Cancelar cambio de entrenador
              </Button>
            )}
          </label>

          {esEdicion && editandoPlan && (
            <Button
              type="button"
              variant="secundario"
              className="mt-4"
              onClick={() => {
                // Revierte al plan original del miembro sin tocar el resto
                // del formulario (nombre, sede, etc. ya editados se conservan).
                if (planIdOriginal) manejarCambioPlan(planIdOriginal);
                setEditandoPlan(false);
              }}
            >
              Cancelar cambio de plan
            </Button>
          )}
        </Card>

        <Button type="button" onClick={manejarClickGuardar} disabled={enviando}>
          Guardar
        </Button>
      </form>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        {!mostrarTicket ? (
          esEdicion ? (
            panelLateral
          ) : (
            <Card>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
                Primer pago
              </h2>
              <p className="mb-4 text-xs" style={{ color: "var(--gx-muted)" }}>
                Se registra en el mismo paso que creás al miembro, así queda activo desde hoy sin
                tener que entrar después a &quot;Registrar pago&quot;.
              </p>

              <SelectorMetodoPago
                metodos={metodosPago}
                monto={precioActual}
                onCambio={setSeleccionMetodo}
                idFormulario={idFormulario}
              />
            </Card>
          )
        ) : (
          <div
            className="rounded-2xl border-2 border-dashed p-5"
            style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface)" }}
          >
            <p
              className="text-center text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--gx-muted)" }}
            >
              {esEdicion ? "Resumen de la edición" : "Resumen del nuevo miembro"}
            </p>

            <div className="my-3 flex justify-center">
              <div
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-lg font-semibold"
                style={{ background: "var(--gx-surface-2)", color: "var(--gx-muted)" }}
              >
                {fotoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo elegido en el cliente, no un asset del proyecto
                  <img src={fotoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  iniciales(nombre || "?")
                )}
              </div>
            </div>

            <div className="my-3 border-t border-dashed" style={{ borderColor: "var(--gx-edge)" }} />

            <dl className="flex flex-col gap-2 text-sm">
              <Fila label="Nombre" valor={nombre || "—"} />
              <Fila label="Cédula" valor={cedula || "—"} />
              <Fila label="Celular" valor={celular || "—"} />
              <Fila label="Inscripción" valor={formatearFecha(fechaInscripcion)} />
              <Fila
                label="Sede"
                valor={sucursalId === ID_AMBAS_SEDES ? "Ambas" : sucursalActivaNombre}
              />
              <Fila label="Plan" valor={nombrePlanActual} />
              <Fila label="Entrenador" valor={requiereEntrenador ? (nombreEntrenadorActual ?? "Sin asignar") : "No aplica"} />
              {!esEdicion && <Fila label="Método de pago" valor={nombreMetodoPagoActual ?? "—"} />}
            </dl>

            <div className="my-3 border-t border-dashed" style={{ borderColor: "var(--gx-edge)" }} />

            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium" style={{ color: "var(--gx-muted)" }}>
                Total
              </span>
              <span className="text-2xl font-bold" style={{ color: "var(--gx-ink)" }}>
                ${precioActual.toFixed(2)}
              </span>
            </div>
            {!esEdicion && montoBsActual !== null && (
              <p className="text-right text-sm" style={{ color: "var(--gx-muted)" }}>
                Bs. {formatearBs(montoBsActual)}
              </p>
            )}

            <p className="mt-5 text-center text-sm font-medium" style={{ color: "var(--gx-muted)" }}>
              ¿Está seguro de la información suministrada?
            </p>

            <div className="mt-3 flex gap-3">
              <Button
                type="button"
                variant="secundario"
                className="flex-1"
                onClick={() => setMostrarTicket(false)}
              >
                No, editar
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={enviando}
                onClick={() => formRef.current?.requestSubmit()}
              >
                {enviando ? "Guardando..." : "Sí, guardar"}
              </Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
