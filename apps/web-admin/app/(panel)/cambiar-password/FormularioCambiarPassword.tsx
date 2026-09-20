"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { cambiarPasswordAction } from "./actions";

export function FormularioCambiarPassword() {
  const [estado, enviar, enviando] = useActionState(cambiarPasswordAction, {});

  return (
    <form action={enviar} className="flex max-w-sm flex-col gap-4">
      {estado.error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
        >
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, var(--gx-good) 15%, transparent)", color: "var(--gx-good)" }}
        >
          Contraseña actualizada correctamente.
        </p>
      )}

      <Input name="passwordActual" label="Contraseña actual" type="password" required />
      <Input name="passwordNueva" label="Nueva contraseña" type="password" required minLength={8} />
      <Input name="passwordConfirmar" label="Confirmar nueva contraseña" type="password" required minLength={8} />

      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
