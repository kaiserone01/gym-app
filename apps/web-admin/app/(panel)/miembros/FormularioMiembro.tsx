"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { Card } from "@gym-app/ui/components/Card";
import type { EstadoFormularioMiembro } from "./actions";
import { METODOS_PAGO, METODOS_BANCARIOS } from "../metodosPago";
import { TASA_BCV_FIJA, METODOS_EN_BS, formatearBs } from "../tasaBcvFija";
import type { EntrenadorResumen } from "@gym-app/domain/entities/EntrenadorResumen";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";
import type { Plan, FrecuenciaPago } from "@gym-app/domain/entities/Plan";

export interface ValoresFormularioMiembro {
  nombre: string;
  cedula: string;
  celular: string;
  fechaInscripcion: string; // yyyy-mm-dd
  sucursalId: string;
  planId: string | null;
  precioPlan: number;
  entrenadorId: string | null;
  fotoUrl: string | null;
}

const ID_PERSONALIZADO = "__personalizado__";

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
  planes,
  valoresIniciales,
  panelLateral,
}: {
  accion: (estado: EstadoFormularioMiembro, formData: FormData) => Promise<EstadoFormularioMiembro>;
  // Entrenadores disponibles por cada sucursal visible — el elegible
  // depende de la sucursal seleccionada en el propio formulario, así que
  // se filtra en el cliente sin ida y vuelta al servidor.
  entrenadoresPorSucursal: Record<string, EntrenadorResumen[]>;
  sucursales: SucursalResumen[];
  planes: Plan[];
  valoresIniciales?: ValoresFormularioMiembro;
  // Contenido propio de la pantalla de edición (dar de baja, historial de
  // pagos, registrar pago) — se muestra en el panel derecho cuando no hay
  // ticket de confirmación abierto, para no tener que scrollear.
  panelLateral?: React.ReactNode;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const esEdicion = !!valoresIniciales;
  const formRef = useRef<HTMLFormElement>(null);

  const [nombre, setNombre] = useState(valoresIniciales?.nombre ?? "");
  const [cedula, setCedula] = useState(valoresIniciales?.cedula ?? "");
  const [celular, setCelular] = useState(valoresIniciales?.celular ?? "");
  const [fechaInscripcion, setFechaInscripcion] = useState(valoresIniciales?.fechaInscripcion ?? hoyISO());
  const [sucursalId, setSucursalId] = useState(valoresIniciales?.sucursalId ?? sucursales[0]?.id ?? "");
  const [entrenadorId, setEntrenadorId] = useState(valoresIniciales?.entrenadorId ?? "");
  const [fotoPreview, setFotoPreview] = useState<string | null>(valoresIniciales?.fotoUrl ?? null);

  // Si la sucursal o el plan actuales del miembro ya no están entre las
  // opciones visibles (p. ej. un plan que se dio de baja, o una sucursal
  // fuera del alcance del usuario que edita), se agregan igual a la lista
  // para no perder el dato al mostrar el formulario.
  const sucursalesConActual =
    valoresIniciales && !sucursales.some((s) => s.id === valoresIniciales.sucursalId)
      ? [...sucursales, { id: valoresIniciales.sucursalId, nombre: "(sede actual)", direccion: null, diasGracia: 0, activo: true }]
      : sucursales;

  const planesActivos = planes.filter(
    (plan) => plan.activo || (valoresIniciales && plan.id === valoresIniciales.planId)
  );

  // Entrenadores elegibles según la sucursal actualmente seleccionada. Si
  // el entrenador ya asignado no está en esa lista (p. ej. se cambió de
  // sede, o el entrenador dejó de tener esa sucursal asignada), se agrega
  // igual para no perder el dato al mostrar el formulario de edición.
  const entrenadoresDeLaSede = entrenadoresPorSucursal[sucursalId] ?? [];
  const entrenadores =
    valoresIniciales?.entrenadorId && !entrenadoresDeLaSede.some((e) => e.id === valoresIniciales.entrenadorId)
      ? [...entrenadoresDeLaSede, { id: valoresIniciales.entrenadorId, nombre: "(entrenador actual)" }]
      : entrenadoresDeLaSede;

  const [planId, setPlanId] = useState<string>(() => {
    if (!valoresIniciales) return planesActivos[0]?.id ?? ID_PERSONALIZADO;
    return valoresIniciales.planId ?? ID_PERSONALIZADO;
  });
  const [precio, setPrecio] = useState<string>(String(valoresIniciales?.precioPlan ?? ""));
  const [frecuenciaPersonalizada, setFrecuenciaPersonalizada] = useState<FrecuenciaPago>("MENSUAL");
  const [entrenadorPersonalizado, setEntrenadorPersonalizado] = useState(false);
  const [errorPrecio, setErrorPrecio] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState("");
  const [numeroOperacion, setNumeroOperacion] = useState("");
  const [mostrarTicket, setMostrarTicket] = useState(false);

  const esPersonalizado = planId === ID_PERSONALIZADO;
  const planSeleccionado = planesActivos.find((p) => p.id === planId);

  const requiereEntrenador = esPersonalizado ? entrenadorPersonalizado : (planSeleccionado?.incluyeEntrenador ?? false);
  const precioActual = Number(precio) || 0;
  const nombrePlanActual = esPersonalizado ? "Personalizado" : (planSeleccionado?.nombre ?? "—");
  const nombreEntrenadorActual = entrenadores.find((e) => e.id === entrenadorId)?.nombre ?? null;
  const nombreMetodoPagoActual = METODOS_PAGO.find((m) => m.value === metodoPago)?.label ?? null;

  // Si se cambia de sede y el entrenador seleccionado no está entre los
  // elegibles de la nueva sede, se limpia la selección en vez de dejar un
  // entrenadorId "fantasma" que el usuario ya no ve en el select.
  useEffect(() => {
    if (entrenadorId && !entrenadores.some((e) => e.id === entrenadorId)) {
      setEntrenadorId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe re-evaluar cuando cambia la sede, no en cada render de `entrenadores`
  }, [sucursalId]);
  const esPagoEnBs = METODOS_EN_BS.includes(metodoPago);
  const tasaCambioActual = esPagoEnBs ? TASA_BCV_FIJA : "";
  const montoBsActual = esPagoEnBs ? precioActual * TASA_BCV_FIJA : null;

  function manejarCambioPlan(nuevoId: string) {
    setPlanId(nuevoId);
    if (nuevoId !== ID_PERSONALIZADO) {
      const plan = planesActivos.find((p) => p.id === nuevoId);
      if (plan) setPrecio(String(plan.precioUSD));
    }
  }

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

        <input type="hidden" name="planId" value={esPersonalizado ? "" : planId} />
        <input type="hidden" name="planPersonalizado" value={esPersonalizado ? "1" : ""} />
        <input type="hidden" name="frecuenciaPersonalizada" value={esPersonalizado ? frecuenciaPersonalizada : ""} />
        <input
          type="hidden"
          name="entrenadorPersonalizado"
          value={esPersonalizado && entrenadorPersonalizado ? "1" : ""}
        />
        <input type="hidden" name="precioPlan" value={precioActual} />
        <input type="hidden" name="planNombre" value={nombrePlanActual} />
        {!esEdicion && (
          <>
            <input type="hidden" name="metodo" value={metodoPago} />
            <input type="hidden" name="tasaCambio" value={tasaCambioActual} />
            <input
              type="hidden"
              name="numeroOperacion"
              value={METODOS_BANCARIOS.includes(metodoPago) ? numeroOperacion : ""}
            />
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

            <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
              Sede asignada
              <select
                name="sucursalId"
                required
                value={sucursalId}
                onChange={(e) => setSucursalId(e.target.value)}
                className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
                style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
              >
                <option value="">Seleccioná una sede</option>
                {sucursalesConActual.map((sucursal) => (
                  <option key={sucursal.id} value={sucursal.id}>
                    {sucursal.nombre}
                  </option>
                ))}
              </select>
              <span className="text-xs" style={{ color: "var(--gx-muted-dim)" }}>
                Determina en qué sucursal puede hacer check-in.
              </span>
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
            Plan de membresía
          </h2>

          <div className="grid grid-cols-2 gap-3">
            {planesActivos.map((plan) => {
              const seleccionado = !esPersonalizado && planId === plan.id;
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

            <button
              type="button"
              onClick={() => manejarCambioPlan(ID_PERSONALIZADO)}
              className="flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors duration-150 active:scale-[0.98]"
              style={
                esPersonalizado
                  ? {
                      borderColor: "var(--gx-accent)",
                      background: "color-mix(in srgb, var(--gx-accent) 12%, transparent)",
                    }
                  : { borderColor: "var(--gx-edge)" }
              }
            >
              <span className="text-sm font-medium" style={{ color: "var(--gx-muted)" }}>
                Personalizado
              </span>
              <span className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
                Definir plan
              </span>
              <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
                Para casos especiales
              </span>
            </button>
          </div>

          {esPersonalizado && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
              <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
                Frecuencia de pago
                <select
                  value={frecuenciaPersonalizada}
                  onChange={(e) => setFrecuenciaPersonalizada(e.target.value as FrecuenciaPago)}
                  className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                >
                  <option value="SEMANAL">Semanal</option>
                  <option value="QUINCENAL">Quincenal</option>
                  <option value="MENSUAL">Mensual</option>
                </select>
              </label>

              <label className="flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
                <input
                  type="checkbox"
                  checked={entrenadorPersonalizado}
                  onChange={(e) => setEntrenadorPersonalizado(e.target.checked)}
                  className="h-5 w-5 accent-[var(--gx-accent)]"
                />
                Incluye entrenador personal
              </label>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
            <Input
              label="Precio (USD)"
              type="number"
              step="0.01"
              min="0"
              value={precio}
              onChange={(e) => {
                setPrecio(e.target.value);
                setErrorPrecio(null);
              }}
            />
            {errorPrecio && (
              <p className="text-sm" style={{ color: "var(--gx-bad)" }}>
                {errorPrecio}
              </p>
            )}
          </div>

          <label className="mt-4 flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
            Entrenador asignado
            <select
              name="entrenadorId"
              value={entrenadorId}
              onChange={(e) => setEntrenadorId(e.target.value)}
              disabled={!requiereEntrenador}
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
            {!requiereEntrenador && (
              <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
                Elegí un plan con entrenador para poder asignar uno.
              </span>
            )}
          </label>
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

              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
                  Método de pago
                  <select
                    form={idFormulario}
                    required
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
                    style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                  >
                    <option value="">Seleccioná un método</option>
                    {METODOS_PAGO.map((metodo) => (
                      <option key={metodo.value} value={metodo.value}>
                        {metodo.label}
                      </option>
                    ))}
                  </select>
                </label>

                {METODOS_BANCARIOS.includes(metodoPago) && (
                  <Input
                    form={idFormulario}
                    label="Número de operación (últimos 4 dígitos)"
                    required
                    maxLength={4}
                    pattern="[0-9]{4}"
                    value={numeroOperacion}
                    onChange={(e) => setNumeroOperacion(e.target.value)}
                  />
                )}

                {esPagoEnBs && montoBsActual !== null && (
                  <div
                    className="rounded-lg border p-3 text-sm"
                    style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}
                  >
                    <div className="flex justify-between">
                      <span style={{ color: "var(--gx-muted)" }}>Tasa BCV (fija, prueba)</span>
                      <span className="font-medium" style={{ color: "var(--gx-ink)" }}>
                        Bs. {TASA_BCV_FIJA}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span style={{ color: "var(--gx-muted)" }}>Monto en bolívares</span>
                      <span className="font-semibold" style={{ color: "var(--gx-ink)" }}>
                        Bs. {formatearBs(montoBsActual)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
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
              <Fila label="Sede" valor={sucursales.find((s) => s.id === sucursalId)?.nombre ?? "—"} />
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
            {!esEdicion && esPagoEnBs && montoBsActual !== null && (
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
