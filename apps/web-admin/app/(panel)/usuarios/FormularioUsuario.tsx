"use client";

import { useActionState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import type { EstadoFormularioUsuario } from "./actions";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

export function FormularioUsuario({
  accion,
  sucursales,
}: {
  accion: (estado: EstadoFormularioUsuario, formData: FormData) => Promise<EstadoFormularioUsuario>;
  sucursales: SucursalResumen[];
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}

      <Input name="nombre" label="Nombre" required />
      <Input name="email" label="Email" type="email" required />
      <Input name="password" label="Contraseña" type="password" required />

      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Rol
        <select name="rol" required className="rounded border border-neutral-300 px-3 py-2">
          <option value="">Seleccioná un rol</option>
          <option value="DUENO">Dueño</option>
          <option value="GERENTE">Gerente</option>
          <option value="RECEPCION">Recepción</option>
          <option value="ENTRENADOR">Entrenador</option>
        </select>
      </label>

      <fieldset className="flex flex-col gap-2 rounded border border-neutral-300 p-3">
        <legend className="px-1 text-sm text-neutral-700">Sucursales asignadas (vacío = toda la organización)</legend>
        {sucursales.map((sucursal) => (
          <label key={sucursal.id} className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="sucursalIds" value={sucursal.id} />
            {sucursal.nombre}
          </label>
        ))}
      </fieldset>

      <Button type="submit" disabled={enviando}>
        {enviando ? "Creando..." : "Crear usuario"}
      </Button>
    </form>
  );
}

export function FormularioEditarUsuario({
  accion,
  nombreInicial,
  email,
  rol,
}: {
  accion: (estado: EstadoFormularioUsuario, formData: FormData) => Promise<EstadoFormularioUsuario>;
  nombreInicial: string;
  email: string;
  rol: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});

  return (
    <form action={enviar} className="flex max-w-md flex-col gap-4">
      {estado.error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{estado.error}</p>}
      <Input name="nombre" label="Nombre" required defaultValue={nombreInicial} />
      <p className="text-sm text-neutral-500">
        Email: {email} · Rol: {rol}
      </p>
      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar nombre"}
      </Button>
    </form>
  );
}
