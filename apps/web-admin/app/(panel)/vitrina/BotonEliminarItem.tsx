"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@gym-app/ui/components/Button";
import { eliminarItemAction } from "./actions";

// Hijo del <form> para que useFormStatus conozca el estado pendiente (evita el doble clic).
function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="peligro" disabled={pending}>
      {pending ? "Eliminando…" : "Eliminar"}
    </Button>
  );
}

export function BotonEliminarItem({ id, volver }: { id: string; volver: string }) {
  return (
    <form
      action={eliminarItemAction}
      onSubmit={(e) => {
        if (!confirm("¿Eliminar este ítem? También se borra su archivo.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="volver" value={volver} />
      <BotonEnviar />
    </form>
  );
}
