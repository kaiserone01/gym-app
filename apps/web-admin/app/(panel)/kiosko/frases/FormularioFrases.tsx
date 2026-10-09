"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { MAX_FRASES_REPOSO, MAX_LARGO_FRASE_REPOSO } from "@gym-app/domain/utils/reposoKiosko";
import { guardarFrasesAction } from "../actions";

export function FormularioFrases({ frasesIniciales }: { frasesIniciales: string[] }) {
  const [estado, enviar, enviando] = useActionState(guardarFrasesAction, {});
  const { mostrarError } = useFeedback();
  const [frases, setFrases] = useState<string[]>(frasesIniciales.length ? frasesIniciales : [""]);

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  function cambiar(indice: number, valor: string) {
    setFrases((actuales) => actuales.map((frase, i) => (i === indice ? valor : frase)));
  }

  function quitar(indice: number) {
    setFrases((actuales) => actuales.filter((_, i) => i !== indice));
  }

  return (
    <form action={enviar} className="flex flex-col gap-3">
      {frases.map((frase, indice) => (
        <div key={indice} className="flex items-center gap-2">
          <input
            name="frase"
            value={frase}
            maxLength={MAX_LARGO_FRASE_REPOSO}
            onChange={(e) => cambiar(indice, e.target.value)}
            placeholder="Escribe una frase"
            className="min-h-11 flex-1 rounded-lg border px-3 gx-campo"
          />
          <Button type="button" variant="secundario" onClick={() => quitar(indice)}>
            Quitar
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          type="button"
          variant="secundario"
          disabled={frases.length >= MAX_FRASES_REPOSO}
          onClick={() => setFrases((actuales) => [...actuales, ""])}
        >
          Agregar frase
        </Button>
        <Button type="submit" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
