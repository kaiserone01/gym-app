"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { cambiarPasswordAction } from "./actions";

export function FormularioCambiarPassword() {
  const [estado, enviar, enviando] = useActionState(cambiarPasswordAction, {});

  return (
    <form action={enviar} className="flex max-w-sm flex-col gap-4">
      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}
      {estado.ok && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">Contraseña actualizada correctamente.</p>
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
