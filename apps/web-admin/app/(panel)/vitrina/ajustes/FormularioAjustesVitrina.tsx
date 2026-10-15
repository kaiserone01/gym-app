"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { TRANSICIONES_VITRINA, type AjustesVitrina } from "@gym-app/domain/entities/Vitrina";
import { DURACION_MAX_SEG, DURACION_MIN_SEG } from "@gym-app/domain/utils/vitrinaItem";
import { guardarAjustesVitrinaAction } from "../actions";

const NOMBRE_TRANSICION: Record<(typeof TRANSICIONES_VITRINA)[number], string> = {
  FUNDIDO: "Fundido",
  DESLIZAR: "Deslizar",
};

export function FormularioAjustesVitrina({ ajustes }: { ajustes: AjustesVitrina }) {
  const [estado, enviar, enviando] = useActionState(guardarAjustesVitrinaAction, {});
  const { mostrarError } = useFeedback();
  const formulario = useRef<HTMLFormElement>(null);
  const mensajeError = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!estado.error) return;
    mostrarError(estado.error);
    // El primer campo inválido recibe el foco; si no hay (error del servidor), el mensaje de error.
    const primero = formulario.current?.querySelector<HTMLElement>(":invalid") ?? mensajeError.current;
    primero?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado
  }, [estado]);

  return (
    <form ref={formulario} action={enviar} className="flex max-w-md flex-col gap-5">
      <Input
        label="Duración por defecto de cada diapositiva (segundos)"
        name="duracionSeg"
        type="number"
        inputMode="numeric"
        min={DURACION_MIN_SEG}
        max={DURACION_MAX_SEG}
        step={1}
        defaultValue={ajustes.duracionSeg}
        aria-describedby="ayuda-duracion"
        required
      />
      <p id="ayuda-duracion" className="-mt-3 text-sm" style={{ color: "var(--gx-muted)" }}>
        Entre {DURACION_MIN_SEG} y {DURACION_MAX_SEG} segundos. Cada ítem puede tener su propia duración.
      </p>
      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Transición entre diapositivas
        <select name="transicion" defaultValue={ajustes.transicion} className="gx-campo min-h-11 rounded-lg border px-3">
          {TRANSICIONES_VITRINA.map((t) => (
            <option key={t} value={t}>
              {NOMBRE_TRANSICION[t]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-2">
        {estado.error && (
          <p ref={mensajeError} tabIndex={-1} role="alert" className="text-sm outline-none" style={{ color: "var(--gx-bad)" }}>
            {estado.error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
