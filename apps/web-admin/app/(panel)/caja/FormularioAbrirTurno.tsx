"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { Card } from "@gym-app/ui/components/Card";
import type { EstadoAbrirTurno } from "./actions";

export function FormularioAbrirTurno({
  accion,
  requiereSucursal,
  sucursales,
}: {
  accion: (estado: EstadoAbrirTurno, formData: FormData) => Promise<EstadoAbrirTurno>;
  requiereSucursal: boolean;
  sucursales: Array<{ id: string; nombre: string }>;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});

  return (
    <Card className="max-w-md">
      <form action={enviar} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--gx-ink)" }}>
          Abrir turno
        </h2>

        {estado.error && (
          <p
            className="rounded-lg px-3 py-2 text-sm"
            style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
          >
            {estado.error}
          </p>
        )}

        {requiereSucursal && (
          <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
            Sucursal
            <select
              name="sucursalId"
              required
              className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
              style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
            >
              <option value="">Seleccioná una sucursal</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <Input name="fondoInicialUSD" label="Fondo inicial (USD)" type="number" step="0.01" required defaultValue="0" />
        <Input name="fondoInicialBs" label="Fondo inicial (Bs)" type="number" step="0.01" required defaultValue="0" />

        <Button type="submit" disabled={enviando}>
          {enviando ? "Abriendo..." : "Abrir turno"}
        </Button>
      </form>
    </Card>
  );
}
