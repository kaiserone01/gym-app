"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { CurrencyInput } from "@gym-app/ui/components/CurrencyInput";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { SelectorFotoPerfil } from "../miembros/SelectorFotoPerfil";
import { formatearBs } from "../tasaBcvFija";
import type { EstadoFormularioProducto } from "./actions";

export interface ValoresFormularioProducto {
  nombre: string;
  descripcion: string | null;
  costoUSD: number;
  fotoUrl: string | null;
  activo: boolean;
}

export function FormularioProducto({
  accion,
  valoresIniciales,
  tasaActual,
}: {
  accion: (estado: EstadoFormularioProducto, formData: FormData) => Promise<EstadoFormularioProducto>;
  valoresIniciales?: ValoresFormularioProducto;
  tasaActual: number | null;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarError } = useFeedback();
  const [fotoPreview, setFotoPreview] = useState<string | null>(valoresIniciales?.fotoUrl ?? null);
  const [costo, setCosto] = useState(valoresIniciales ? String(valoresIniciales.costoUSD) : "");

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  function manejarCambioFoto(archivo: File) {
    if (fotoPreview?.startsWith("blob:")) URL.revokeObjectURL(fotoPreview);
    setFotoPreview(URL.createObjectURL(archivo));
  }

  const costoNumero = Number(costo);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div
          className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs"
          style={{ background: "var(--gx-surface-2)", color: "var(--gx-muted)" }}
        >
          {fotoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto en R2 (dominio externo) o vista previa local
            <img src={fotoPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            "Sin foto"
          )}
        </div>
        <SelectorFotoPerfil
          tieneFoto={!!fotoPreview}
          onCambio={manejarCambioFoto}
          etiqueta="Foto del producto"
          guiaCircular={false}
          camaraInicial="environment"
        />
      </div>
      <input type="hidden" name="fotoUrl" value={valoresIniciales?.fotoUrl ?? ""} />

      <Input name="nombre" label="Nombre" required defaultValue={valoresIniciales?.nombre} />

      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Descripción (opcional)
        <textarea
          name="descripcion"
          rows={3}
          defaultValue={valoresIniciales?.descripcion ?? ""}
          className="rounded-lg border px-3 py-2 outline-none focus:border-[var(--gx-accent)]"
          style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
        />
      </label>

      <div className="flex flex-col gap-1">
        <CurrencyInput name="costoUSD" label="Costo" moneda="USD" required value={costo} onChange={setCosto} />
        {tasaActual !== null && costoNumero > 0 && (
          <span className="text-xs" style={{ color: "var(--gx-muted)" }}>
            Equivale a Bs. {formatearBs(costoNumero * tasaActual)} a la tasa vigente.
          </span>
        )}
      </div>

      {valoresIniciales && (
        <label className="flex min-h-11 items-center gap-2 text-sm" style={{ color: "var(--gx-muted)" }}>
          <input
            type="checkbox"
            name="activo"
            defaultChecked={valoresIniciales.activo}
            className="h-5 w-5 accent-[var(--gx-accent)]"
          />
          Activo (disponible para vender en Caja)
        </label>
      )}

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
