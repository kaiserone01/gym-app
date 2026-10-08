"use client";

import { useState, useTransition } from "react";
import { Input } from "@gym-app/ui/components/Input";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { activarDesdeExcelAction } from "./actions";

export function ActivarDesdeExcel() {
  const [cedula, setCedula] = useState("");
  const [activando, iniciarTransicion] = useTransition();
  const { mostrarError } = useFeedback();

  function activar() {
    iniciarTransicion(async () => {
      try {
        const resultado = await activarDesdeExcelAction(cedula);
        if (resultado?.error) mostrarError(resultado.error);
      } catch (error) {
        mostrarError(error instanceof Error ? error.message : "No se pudo activar al miembro.");
      }
    });
  }

  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 print:hidden">
      <Input label="¿No aparece? Activar desde Excel por cédula" type="text" inputMode="numeric" value={cedula} onChange={(e) => setCedula(e.target.value)} />
      <Button type="button" onClick={activar} disabled={activando || cedula.trim() === ""}>
        Activar desde Excel
      </Button>
    </div>
  );
}
