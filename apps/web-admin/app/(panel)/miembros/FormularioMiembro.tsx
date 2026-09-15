"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioMiembro } from "./actions";
import { PRESETS_PLAN_MIEMBRO } from "./planesPreset";
import { METODOS_PAGO } from "../metodosPago";
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
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium text-neutral-900">{valor}</dd>
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
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>
        )}

        <input type="hidden" name="planTipo" value={planTipoActual} />
        <input type="hidden" name="precioPlan" value={precioActual} />
        <input type="hidden" name="planNombre" value={nombrePlanActual} />
        {!esEdicion && (
          <>
            <input type="hidden" name="metodo" value={metodoPago} />
            <input type="hidden" name="tasaCambio" value={tasaCambioActual} />
            <input type="hidden" name="numeroOperacion" value={metodoPago === "pago_movil" ? numeroOperacion : ""} />
          </>
        )}

        <section className="rounded-xl border border-neutral-200 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Datos personales
          </h2>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-lg font-semibold text-neutral-500">
                {fotoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo elegido en el cliente, no un asset del proyecto
                  <img src={fotoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  iniciales(nombre || "?")
                )}
              </div>

              <label className="flex flex-col gap-1 text-sm text-neutral-700">
                Foto de perfil
                <input
                  type="file"
                  name="foto"
                  accept="image/*"
                  onChange={(e) => manejarCambioFoto(e.target.files?.[0])}
                  className="text-sm text-neutral-600 file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-200"
                />
                <span className="text-xs text-neutral-400">
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
        </section>

        <section className="rounded-xl border border-neutral-200 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
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
                  className={`flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors ${
                    seleccionado
                      ? "border-blue-600 bg-blue-50"
                      : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <span className="text-sm font-medium text-neutral-700">{preset.nombre}</span>
                  <span className="text-2xl font-semibold text-neutral-900">
                    ${preset.precio}
                    <span className="text-sm font-normal text-neutral-500">/mes</span>
                  </span>
                  {preset.planTipo === "CON_ENTRENADOR" && (
                    <span className="text-xs font-medium text-blue-600">Incluye entrenador</span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setPresetKey("personalizado")}
              className={`flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors ${
                esCustom ? "border-blue-600 bg-blue-50" : "border-neutral-200 hover:border-neutral-300"
              }`}
            >
              <span className="text-sm font-medium text-neutral-700">Personalizado</span>
              <span className="text-lg font-semibold text-neutral-900">Definir precio</span>
              <span className="text-xs text-neutral-500">Para casos especiales</span>
            </button>
          </div>

          {esCustom && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
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
                <p className="text-sm text-red-700">{errorPrecioPersonalizado}</p>
              )}

              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={entrenadorPersonalizado}
                  onChange={(e) => setEntrenadorPersonalizado(e.target.checked)}
                />
                Incluye entrenador personal
              </label>
            </div>
          )}

          <label className="mt-4 flex flex-col gap-1 text-sm text-neutral-700">
            Entrenador asignado
            <select
              name="entrenadorId"
              value={entrenadorId}
              onChange={(e) => setEntrenadorId(e.target.value)}
              disabled={!requiereEntrenador}
              className="rounded border border-neutral-300 px-3 py-2 disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              <option value="">Seleccioná un entrenador</option>
              {entrenadores.map((entrenador) => (
                <option key={entrenador.id} value={entrenador.id}>
                  {entrenador.nombre}
                </option>
              ))}
            </select>
            {!requiereEntrenador && (
              <span className="text-xs text-neutral-400">
                Elegí un plan con entrenador para poder asignar uno.
              </span>
            )}
          </label>
        </section>

        <Button type="button" onClick={manejarClickGuardar} disabled={enviando}>
          Guardar
        </Button>
      </form>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        {!mostrarTicket ? (
          esEdicion ? (
            panelLateral
          ) : (
            <div className="rounded-xl border border-neutral-200 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Primer pago
              </h2>
              <p className="mb-4 text-xs text-neutral-400">
                Se registra en el mismo paso que creás al miembro, así queda activo desde hoy sin
                tener que entrar después a &quot;Registrar pago&quot;.
              </p>

              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1 text-sm text-neutral-700">
                  Método de pago
                  <select
                    form={idFormulario}
                    required
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    className="rounded border border-neutral-300 px-3 py-2"
                  >
                    <option value="">Seleccioná un método</option>
                    {METODOS_PAGO.map((metodo) => (
                      <option key={metodo.value} value={metodo.value}>
                        {metodo.label}
                      </option>
                    ))}
                  </select>
                </label>

                {metodoPago === "pago_movil" && (
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
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Tasa BCV (fija, prueba)</span>
                      <span className="font-medium text-neutral-900">Bs. {TASA_BCV_FIJA}</span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span className="text-neutral-500">Monto en bolívares</span>
                      <span className="font-semibold text-neutral-900">Bs. {formatearBs(montoBsActual)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-5">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-neutral-500">
              {esEdicion ? "Resumen de la edición" : "Resumen del nuevo miembro"}
            </p>

            <div className="my-3 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-lg font-semibold text-neutral-500">
                {fotoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo elegido en el cliente, no un asset del proyecto
                  <img src={fotoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  iniciales(nombre || "?")
                )}
              </div>
            </div>

            <div className="my-3 border-t border-dashed border-neutral-300" />

            <dl className="flex flex-col gap-2 text-sm">
              <Fila label="Nombre" valor={nombre || "—"} />
              <Fila label="Cédula" valor={cedula || "—"} />
              <Fila label="Celular" valor={celular || "—"} />
              <Fila label="Inscripción" valor={formatearFecha(fechaInscripcion)} />
              <Fila label="Plan" valor={nombrePlanActual} />
              <Fila label="Entrenador" valor={requiereEntrenador ? (nombreEntrenadorActual ?? "Sin asignar") : "No aplica"} />
              {!esEdicion && <Fila label="Método de pago" valor={nombreMetodoPagoActual ?? "—"} />}
            </dl>

            <div className="my-3 border-t border-dashed border-neutral-300" />

            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-neutral-700">Total</span>
              <span className="text-2xl font-bold text-neutral-900">${precioActual.toFixed(2)}</span>
            </div>
            {!esEdicion && esPagoEnBs && montoBsActual !== null && (
              <p className="text-right text-sm text-neutral-500">Bs. {formatearBs(montoBsActual)}</p>
            )}

            <p className="mt-5 text-center text-sm font-medium text-neutral-700">
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
