"use client";

import { useEffect, useMemo, useState } from "react";
import type { Miembro } from "@gym-app/domain/entities/Miembro";

// Solo los campos que este modal necesita mostrar del plan — evita atar
// este componente al tipo Plan completo del dominio (frecuencia, activo,
// etc. no se usan acá).
export interface PlanParaModal {
  id: string;
  nombre: string;
  precioUSD: number;
  multisede: boolean;
}

const MINIMO_CARACTERES_BUSQUEDA = 3;

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
      className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
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

export interface MiembroConPlan {
  id: string;
  nombre: string;
  cedula: string;
  fotoUrl: string | null;
  plan: PlanParaModal | undefined;
}

/**
 * Modal de búsqueda de miembro para Registrar pago en Caja — reemplaza el
 * <select> plano por búsqueda por nombre/cédula (mínimo 3 caracteres, igual
 * criterio que ListaMiembros en /miembros) con resultados en cards. No
 * navega a la ficha del miembro (eso es exclusivo de /miembros): acá solo
 * se elige a quién se le cobra, y el pago queda atado a su plan vigente —
 * el cambio de plan se hace desde /miembros (ver diseño acordado).
 */
export function SelectorMiembroModal({
  miembros,
  planes,
  onSeleccionar,
  onCerrar,
}: {
  miembros: Miembro[];
  planes: PlanParaModal[];
  onSeleccionar: (miembro: MiembroConPlan) => void;
  onCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const planesPorId = useMemo(() => new Map(planes.map((p) => [p.id, p])), [planes]);

  useEffect(() => {
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const busquedaAplicada = busqueda.trim().length >= MINIMO_CARACTERES_BUSQUEDA ? busqueda.trim().toLowerCase() : "";

  const resultados = useMemo(() => {
    if (!busquedaAplicada) return [];
    return miembros
      .filter((m) => `${m.nombre} ${m.cedula}`.toLowerCase().includes(busquedaAplicada))
      .slice(0, 20)
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        cedula: m.cedula,
        fotoUrl: m.fotoUrl,
        plan: m.planId ? planesPorId.get(m.planId) : undefined,
      }));
  }, [miembros, busquedaAplicada, planesPorId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Seleccionar miembro"
      onClick={onCerrar}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border-2 p-6"
        style={{ borderColor: "var(--gx-accent)", background: "var(--gx-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
            Seleccionar miembro
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-sm transition-colors duration-150 hover:bg-[var(--gx-surface-2)]"
            style={{ color: "var(--gx-muted)" }}
          >
            ✕
          </button>
        </div>

        <label className="mt-4 flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Nombre o cédula
          <input
            type="text"
            autoFocus
            placeholder="Mínimo 3 caracteres..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="min-h-11 rounded-lg border px-3 outline-none transition-colors duration-150 focus:border-[var(--gx-accent)]"
            style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
          />
        </label>

        <div className="mt-4 flex-1 overflow-y-auto">
          {busquedaAplicada === "" && (
            <p className="py-8 text-center text-sm" style={{ color: "var(--gx-muted)" }}>
              Escribí al menos 3 caracteres para buscar.
            </p>
          )}

          {busquedaAplicada !== "" && resultados.length === 0 && (
            <p className="py-8 text-center text-sm" style={{ color: "var(--gx-muted)" }}>
              Ningún miembro coincide con "{busqueda.trim()}".
            </p>
          )}

          <div className="flex flex-col gap-2">
            {resultados.map((miembro) => {
              const sinPlan = !miembro.plan;
              return (
                <button
                  key={miembro.id}
                  type="button"
                  disabled={sinPlan}
                  onClick={() => !sinPlan && onSeleccionar(miembro)}
                  className="flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ borderColor: "var(--gx-edge)" }}
                >
                  <Avatar fotoUrl={miembro.fotoUrl} nombre={miembro.nombre} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" style={{ color: "var(--gx-ink)" }}>
                      {miembro.nombre}
                    </p>
                    <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
                      {miembro.cedula}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    {sinPlan ? (
                      <span style={{ color: "var(--gx-bad)" }}>Sin plan asignado</span>
                    ) : (
                      <>
                        <p style={{ color: "var(--gx-ink)" }}>{miembro.plan!.nombre}</p>
                        <p className="font-semibold" style={{ color: "var(--gx-accent)" }}>
                          ${miembro.plan!.precioUSD.toFixed(2)}
                        </p>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
