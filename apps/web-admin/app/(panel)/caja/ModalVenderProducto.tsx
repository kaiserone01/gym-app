"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { Producto } from "@gym-app/domain/entities/Producto";
import type { MetodoPago } from "@gym-app/domain/entities/MetodoPago";
import { SelectorMetodoPago } from "../pagos/SelectorMetodoPago";
import { formatearBs } from "../tasaBcvFija";
import type { EstadoVenderProducto } from "./actions";

const ID_FORMULARIO = "formulario-vender-producto";

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

export function ModalVenderProducto({
  accion,
  productos,
  metodosPago,
  tasaActual,
  onCerrar,
}: {
  accion: (estado: EstadoVenderProducto, formData: FormData) => Promise<EstadoVenderProducto>;
  productos: Producto[];
  metodosPago: MetodoPago[];
  tasaActual: number | null;
  onCerrar: () => void;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarExito, mostrarError } = useFeedback();

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

  const [productoId, setProductoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [seleccion, setSeleccion] = useState<Seleccion>(SELECCION_VACIA);

  const producto = productos.find((p) => p.id === productoId) ?? null;
  const total = producto ? Math.round(producto.costoUSD * cantidad * 100) / 100 : 0;
  const numeroOperacionValido = !seleccion.requiereNumeroOperacion || /^\d{4}$/.test(seleccion.numeroOperacion);
  const puedeEnviar = producto !== null && seleccion.metodoPagoId !== null && numeroOperacionValido;

  const lineas = [
    {
      monto: total,
      metodo: seleccion.metodo,
      metodoPagoId: seleccion.metodoPagoId,
      numeroOperacion: seleccion.requiereNumeroOperacion ? seleccion.numeroOperacion : null,
      tasaCambio: seleccion.tasaCambio,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-label="Vender producto"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
          Vender producto
        </h3>

        {productos.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: "var(--gx-muted)" }}>
            No hay productos activos. Créalos en la sección Productos.
          </p>
        ) : (
          <form id={ID_FORMULARIO} action={enviar} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="productoId" value={productoId ?? ""} />
            <input type="hidden" name="cantidad" value={cantidad} />
            <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />

            <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {productos.map((p) => {
                const elegido = p.id === productoId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProductoId(p.id)}
                    aria-pressed={elegido}
                    className="flex flex-col gap-1 rounded-xl border-2 p-2 text-left transition-colors"
                    style={{
                      borderColor: elegido ? "var(--gx-accent)" : "var(--gx-edge)",
                      background: "var(--gx-surface-2)",
                    }}
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-lg" style={{ background: "var(--gx-surface)" }}>
                      {p.fotoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- foto en R2 (dominio externo)
                        <img src={p.fotoUrl} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <span className="truncate text-sm font-medium" style={{ color: "var(--gx-ink)" }}>
                      {p.nombre}
                    </span>
                    <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
                      ${p.costoUSD.toFixed(2)}
                      {tasaActual !== null && ` · Bs. ${formatearBs(p.costoUSD * tasaActual)}`}
                    </span>
                  </button>
                );
              })}
            </div>

            {producto && (
              <>
                <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "var(--gx-surface-2)" }}>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secundario"
                      aria-label="Menos"
                      disabled={cantidad <= 1}
                      onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                    >
                      −
                    </Button>
                    <span className="w-8 text-center font-semibold" style={{ color: "var(--gx-ink)" }}>
                      {cantidad}
                    </span>
                    <Button type="button" variant="secundario" aria-label="Más" onClick={() => setCantidad((c) => c + 1)}>
                      +
                    </Button>
                  </div>
                  <div className="text-right">
                    <span className="block font-semibold" style={{ color: "var(--gx-ink)" }}>
                      Total ${total.toFixed(2)}
                    </span>
                    {tasaActual !== null && (
                      <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
                        Bs. {formatearBs(total * tasaActual)}
                      </span>
                    )}
                  </div>
                </div>

                <SelectorMetodoPago
                  metodos={metodosPago}
                  monto={total}
                  idFormulario={ID_FORMULARIO}
                  onCambio={setSeleccion}
                  avisoServidor={{ tasaNueva: estado.tasaNueva, fallaTemporal: estado.fallaTemporal, tasaGuardada: estado.tasaGuardada }}
                />
              </>
            )}
          </form>
        )}

        <div className="mt-4 flex gap-3">
          <Button type="button" variant="secundario" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" form={ID_FORMULARIO} className="flex-1" disabled={!puedeEnviar || enviando}>
            {enviando ? "Registrando..." : "Registrar venta"}
          </Button>
        </div>
      </div>
    </div>
  );
}
