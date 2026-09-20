"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { Card } from "@gym-app/ui/components/Card";
import type { EstadoFormularioMiembro } from "./actions";
import { PRESETS_PLAN_MIEMBRO } from "./planesPreset";
import { METODOS_PAGO, METODOS_BANCARIOS } from "../metodosPago";
import { TASA_BCV_FIJA, METODOS_EN_BS, formatearBs } from "../tasaBcvFija";
import type { EntrenadorResumen } from "@gym-app/domain/entities/EntrenadorResumen";

export interface ValoresFormularioMiembro {
  nombre: string;
  cedula: string;
  celular: string;
  fechaInscripcion: string; // yyyy-mm-dd
  planTipo: "SIN_ENTRENADOR" | "CON_ENTRENADOR";
  precioPlan: number;
  entrenadorId: string | null;
  fotoUrl: string | null;
}

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
  entrenadores,
  valoresIniciales,
  panelLateral,
}: {
  accion: (estado: EstadoFormularioMiembro, formData: FormData) => Promise<EstadoFormularioMiembro>;
  entrenadores: EntrenadorResumen[];
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
  const [entrenadorId, setEntrenadorId] = useState(valoresIniciales?.entrenadorId ?? "");
  const [fotoPreview, setFotoPreview] = useState<string | null>(valoresIniciales?.fotoUrl ?? null);

  const [presetKey, setPresetKey] = useState<string>(() => {
    if (!valoresIniciales) return "mensual_sin";
    const coincide = PRESETS_PLAN_MIEMBRO.find(
      (preset) => preset.planTipo === valoresIniciales.planTipo && preset.precio === valoresIniciales.precioPlan
    );
    return coincide?.key ?? "personalizado";
  });
  const [precioPersonalizado, setPrecioPersonalizado] = useState<string>(
    presetKey === "personalizado" ? String(valoresIniciales?.precioPlan ?? "") : ""
  );
  const [entrenadorPersonalizado, setEntrenadorPersonalizado] = useState(
    valoresIniciales?.planTipo === "CON_ENTRENADOR"
  );
  const [errorPrecioPersonalizado, setErrorPrecioPersonalizado] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState("");
  const [numeroOperacion, setNumeroOperacion] = useState("");
  const [mostrarTicket, setMostrarTicket] = useState(false);

  const esCustom = presetKey === "personalizado";
  const presetSeleccionado = PRESETS_PLAN_MIEMBRO.find((preset) => preset.key === presetKey);

  const planTipoActual: "SIN_ENTRENADOR" | "CON_ENTRENADOR" = esCustom
    ? entrenadorPersonalizado
      ? "CON_ENTRENADOR"
      : "SIN_ENTRENADOR"
    : (presetSeleccionado?.planTipo ?? "SIN_ENTRENADOR");

  const requiereEntrenador = planTipoActual === "CON_ENTRENADOR";
  const precioActual = esCustom ? Number(precioPersonalizado) || 0 : (presetSeleccionado?.precio ?? 0);
  const nombrePlanActual = esCustom ? "Personalizado" : (presetSeleccionado?.nombre ?? "—");
  const nombreEntrenadorActual = entrenadores.find((e) => e.id === entrenadorId)?.nombre ?? null;
  const nombreMetodoPagoActual = METODOS_PAGO.find((m) => m.value === metodoPago)?.label ?? null;
  const esPagoEnBs = METODOS_EN_BS.includes(metodoPago);
  const tasaCambioActual = esPagoEnBs ? TASA_BCV_FIJA : "";
  const montoBsActual = esPagoEnBs ? precioActual * TASA_BCV_FIJA : null;

  function manejarClickGuardar() {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;

    if (esCustom && (!precioPersonalizado || Number(precioPersonalizado) <= 0)) {
      setErrorPrecioPersonalizado("Ingresá un precio válido.");
      return;
    }

    setErrorPrecioPersonalizado(null);
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

        <input type="hidden" name="planTipo" value={planTipoActual} />
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
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--gx-muted)" }}>
            Plan de membresía
          </h2>

          <div className="grid grid-cols-2 gap-3">
            {PRESETS_PLAN_MIEMBRO.map((preset) => {
              const seleccionado = presetKey === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setPresetKey(preset.key)}
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
                    {preset.nombre}
                  </span>
                  <span className="text-2xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                    ${preset.precio}
                    <span className="text-sm font-normal" style={{ color: "var(--gx-muted)" }}>
                      /mes
                    </span>
                  </span>
                  {preset.planTipo === "CON_ENTRENADOR" && (
                    <span className="text-xs font-medium" style={{ color: "var(--gx-accent)" }}>
                      Incluye entrenador
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setPresetKey("personalizado")}
              className="flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors duration-150 active:scale-[0.98]"
              style={
                esCustom
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
                Definir precio
              </span>
              <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
                Para casos especiales
              </span>
            </button>
          </div>

          {esCustom && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border p-4" style={{ borderColor: "var(--gx-edge)" }}>
              <Input
                label="Precio personalizado (USD)"
                type="number"
                step="0.01"
                min="0"
                value={precioPersonalizado}
                onChange={(e) => {
                  setPrecioPersonalizado(e.target.value);
                  setErrorPrecioPersonalizado(null);
                }}
              />
              {errorPrecioPersonalizado && (
                <p className="text-sm" style={{ color: "var(--gx-bad)" }}>
                  {errorPrecioPersonalizado}
                </p>
              )}

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
