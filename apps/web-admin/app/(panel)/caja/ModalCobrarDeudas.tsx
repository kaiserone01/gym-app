"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import type { GrupoDeudasMiembro } from "@gym-app/domain/use-cases/ListarDeudasPendientes";
import type { AbonoPendiente } from "@gym-app/domain/use-cases/ListarAbonosPendientes";
import { totalDeudas } from "@gym-app/domain/entities/DeudaProducto";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { CampoNumeroOperacion } from "../pagos/CampoNumeroOperacion";
import { MetodoYCampos } from "../pagos/MetodoYCampos";
import { ColumnaLateral, ColumnaPrincipal, MarcoAsistente, TituloSeccion } from "./MarcoAsistente";
import { formatearBs } from "../tasaBcvFija";
import { formatearFechaCorta } from "./ProyeccionCiclosUI";
import type { EstadoCobrarDeudas } from "./actions";

const ID_FORMULARIO = "formulario-cobrar-deudas";

interface CuentaPorCobrar {
  miembroId: string;
  miembroNombre: string;
  deudas: GrupoDeudasMiembro["deudas"];
  abono: AbonoPendiente | null;
  totalUSD: number;
}

interface Seleccion {
  metodoPagoId: string | null;
  metodo: string;
  tasaCambio: number | null;
  numeroOperacion: string;
  requiereNumeroOperacion: boolean;
}

const SELECCION_VACIA: Seleccion = {
  metodoPagoId: null,
  metodo: "",
  tasaCambio: null,
  numeroOperacion: "",
  requiereNumeroOperacion: false,
};

export function ModalCobrarDeudas({
  grupos: gruposDeProductos,
  abonos,
  metodosPago,
  tasaActual,
  accionCobrar,
  accionAnular,
  onCerrar,
}: {
  grupos: GrupoDeudasMiembro[];
  abonos: AbonoPendiente[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  accionCobrar: (estado: EstadoCobrarDeudas, formData: FormData) => Promise<EstadoCobrarDeudas>;
  accionAnular: (id: string) => Promise<{ error?: string; ok?: string }>;
  onCerrar: () => void;
}) {
  const [estado, enviar, enviando] = useActionState(accionCobrar, {});
  const { mostrarExito, mostrarError } = useFeedback();
  const [anulando, iniciarTransicion] = useTransition();
  const [miembroId, setMiembroId] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion>(SELECCION_VACIA);

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  useEffect(() => {
    if (estado.ok) {
      mostrarExito(estado.ok);
      onCerrar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok, no a mostrarExito/onCerrar
  }, [estado.ok]);

  // Cuentas por cobrar por miembro: productos fiados y/o saldo de la membresía (abono pendiente).
  const grupos: CuentaPorCobrar[] = [
    ...new Set([...gruposDeProductos.map((g) => g.miembroId), ...abonos.map((a) => a.miembroId)]),
  ]
    .map((id) => {
      const productos = gruposDeProductos.find((g) => g.miembroId === id);
      const abono = abonos.find((a) => a.miembroId === id) ?? null;
      const deudas = productos?.deudas ?? [];
      return {
        miembroId: id,
        miembroNombre: productos?.miembroNombre ?? abono?.miembroNombre ?? id,
        deudas,
        abono,
        totalUSD: totalDeudas(deudas) + (abono?.saldoUSD ?? 0),
      };
    })
    .sort((a, b) => a.miembroNombre.localeCompare(b.miembroNombre, "es"));

  const grupo = grupos.find((g) => g.miembroId === miembroId) ?? null;
  const total = grupo ? grupo.totalUSD : 0;
  const numeroOperacionValido = !seleccion.requiereNumeroOperacion || /^\d{4}$/.test(seleccion.numeroOperacion);
  const puedeEnviar = grupo !== null && seleccion.metodoPagoId !== null && numeroOperacionValido;

  const lineas = [
    {
      monto: total,
      metodo: seleccion.metodo,
      metodoPagoId: seleccion.metodoPagoId,
      numeroOperacion: seleccion.requiereNumeroOperacion ? seleccion.numeroOperacion : null,
      tasaCambio: seleccion.tasaCambio,
    },
  ];

  function anular(id: string, nombre: string) {
    if (!window.confirm(`¿Anular "${nombre}"? Se quita de lo que debe el miembro.`)) return;
    iniciarTransicion(async () => {
      const resultado = await accionAnular(id);
      if (resultado.error) mostrarError(resultado.error);
      else if (resultado.ok) mostrarExito(resultado.ok);
    });
  }

  const bs = (usd: number) => (tasaActual !== null ? `Bs. ${formatearBs(usd * tasaActual)}` : null);

  return (
    <MarcoAsistente titulo="Cobrar deudas" etiqueta={grupo ? grupo.miembroNombre : "Elige un miembro"} onCerrar={onCerrar}>
      {grupos.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          No hay cuentas por cobrar.
        </p>
      ) : !grupo ? (
        <>
          <ColumnaPrincipal>
            <TituloSeccion>Cuentas por cobrar</TituloSeccion>
            <ul className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {grupos.map((g) => (
                <li key={g.miembroId}>
                  <button
                    type="button"
                    onClick={() => setMiembroId(g.miembroId)}
                    className="flex w-full flex-col gap-1 rounded-xl border-2 p-4 text-left transition-colors duration-150 hover:border-[var(--gx-accent)]"
                    style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}
                  >
                    <span className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
                      {g.miembroNombre}
                    </span>
                    {g.abono && (
                      <span className="text-sm" style={{ color: "var(--gx-ink)" }}>
                        Membresía {g.abono.planNombre} · saldo ${g.abono.saldoUSD.toFixed(2)}
                        <span className="block text-xs" style={{ color: "var(--gx-muted)" }}>
                          Próximo abono: {formatearFechaCorta(g.abono.fechaProximoAbono)}
                        </span>
                      </span>
                    )}
                    {g.deudas.length > 0 && (
                      <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
                        {g.deudas.length} {g.deudas.length === 1 ? "producto" : "productos"}
                      </span>
                    )}
                    <span className="text-xl font-bold" style={{ color: "var(--gx-accent)" }}>
                      ${g.totalUSD.toFixed(2)}
                      {bs(g.totalUSD) && (
                        <span className="block text-sm font-normal" style={{ color: "var(--gx-muted)" }}>
                          {bs(g.totalUSD)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ColumnaPrincipal>
          <ColumnaLateral>
            <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
              Elige un miembro para ver lo que debe (productos y saldo de membresía) y cobrarlo en un solo pago.
            </p>
            <Button type="button" variant="secundario" className="mt-auto min-h-12 text-base" onClick={onCerrar}>
              Cerrar
            </Button>
          </ColumnaLateral>
        </>
      ) : (
        <>
          <form id={ID_FORMULARIO} action={enviar} className="contents">
            <input type="hidden" name="miembroId" value={grupo.miembroId} />
            {grupo.abono && <input type="hidden" name="incluirMembresia" value="1" />}
            <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />
            <ColumnaPrincipal>
              <TituloSeccion>Método de pago</TituloSeccion>
              <MetodoYCampos
                vacio={seleccion.metodoPagoId ? "Este método no requiere número de operación." : "Elige un método de pago."}
                selector={
                  <SelectorMetodoPago
                    compacto
                    grande
                    metodos={metodosPago}
                    monto={total}
                    idFormulario={ID_FORMULARIO}
                    onCambio={setSeleccion}
                    avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
                    ocultarNumeroOperacion
                    numeroOperacion={seleccion.numeroOperacion}
                    onCambioNumeroOperacion={(valor) => setSeleccion((prev) => ({ ...prev, numeroOperacion: valor }))}
                  />
                }
                campos={
                  seleccion.requiereNumeroOperacion && (
                    <CampoNumeroOperacion
                      value={seleccion.numeroOperacion}
                      onChange={(valor) => setSeleccion((prev) => ({ ...prev, numeroOperacion: valor }))}
                    />
                  )
                }
              />
            </ColumnaPrincipal>
          </form>

          <ColumnaLateral>
            <div className="flex items-center justify-between gap-3">
              <TituloSeccion>Lo que debe</TituloSeccion>
              <button type="button" className="text-sm font-medium hover:underline" style={{ color: "var(--gx-accent)" }} onClick={() => setMiembroId(null)}>
                Otro miembro
              </button>
            </div>
            <ul className="flex flex-col gap-2 lg:flex-1 lg:overflow-y-auto">
              {grupo.abono && (
                <li className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: "var(--gx-surface-2)" }}>
                  <span className="min-w-0 break-words" style={{ color: "var(--gx-ink)" }}>
                    Membresía {grupo.abono.planNombre}
                    <span className="mt-1 block text-xs" style={{ color: "var(--gx-muted)" }}>
                      Abonado ${grupo.abono.pagadoUSD.toFixed(2)} de ${grupo.abono.precioUSD.toFixed(2)}
                    </span>
                    <span className="block text-xs" style={{ color: "var(--gx-muted)" }}>
                      Ciclo hasta {formatearFechaCorta(grupo.abono.finCiclo)}
                    </span>
                    <span className="block text-xs font-medium" style={{ color: "var(--gx-accent)" }}>
                      Próximo abono: {formatearFechaCorta(grupo.abono.fechaProximoAbono)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold" style={{ color: "var(--gx-ink)" }}>
                    ${grupo.abono.saldoUSD.toFixed(2)}
                  </span>
                </li>
              )}
              {grupo.deudas.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ background: "var(--gx-surface-2)" }}>
                  <span className="min-w-0 break-words" style={{ color: "var(--gx-ink)" }}>
                    {d.productoNombre}
                    {d.cantidad > 1 ? ` × ${d.cantidad}` : ""}
                    <button
                      type="button"
                      disabled={anulando}
                      onClick={() => anular(d.id, d.productoNombre)}
                      className="mt-1 block text-xs font-medium hover:underline disabled:opacity-50"
                      style={{ color: "var(--gx-bad)" }}
                    >
                      Anular
                    </button>
                  </span>
                  <span className="shrink-0 font-semibold" style={{ color: "var(--gx-ink)" }}>
                    ${totalDeudas([d]).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--gx-edge)" }}>
              <span className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
                Total ${total.toFixed(2)}
              </span>
              {bs(total) && (
                <span className="text-sm" style={{ color: "var(--gx-accent)" }}>
                  {bs(total)}
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="secundario" className="min-h-12 flex-1 text-base" onClick={onCerrar}>
                Cerrar
              </Button>
              <Button type="submit" form={ID_FORMULARIO} className="min-h-12 flex-1 text-base" disabled={!puedeEnviar || enviando}>
                {enviando ? "Cobrando..." : "Cobrar"}
              </Button>
            </div>
          </ColumnaLateral>
        </>
      )}
    </MarcoAsistente>
  );
}
