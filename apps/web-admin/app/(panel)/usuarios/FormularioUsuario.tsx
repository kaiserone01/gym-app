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
      {estado.error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
        >
          {estado.error}
        </p>
      )}

      <Input name="nombre" label="Nombre" required />
      <Input name="email" label="Email" type="email" required />
      <Input name="password" label="Contraseña" type="password" required />

      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Rol
        <select
          name="rol"
          required
          className="min-h-11 rounded-lg border px-3 outline-none focus:border-[var(--gx-accent)]"
          style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
        >
          <option value="">Seleccioná un rol</option>
          <option value="SOCIO">Socio</option>
          <option value="GERENTE">Gerente</option>
          <option value="RECEPCION">Recepción</option>
          <option value="ENTRENADOR">Entrenador</option>
        </select>
      </label>

      <fieldset className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--gx-edge)" }}>
        <legend className="px-1 text-sm" style={{ color: "var(--gx-muted)" }}>
          Sucursales asignadas (vacío = toda la organización)
        </legend>
        {sucursales.map((sucursal) => (
          <label
            key={sucursal.id}
            className="flex min-h-11 items-center gap-2 text-sm"
            style={{ color: "var(--gx-muted)" }}
          >
            <input type="checkbox" name="sucursalIds" value={sucursal.id} className="h-5 w-5 accent-[var(--gx-accent)]" />
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
      {estado.error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
        >
          {estado.error}
        </p>
      )}
      <Input name="nombre" label="Nombre" required defaultValue={nombreInicial} />
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        Email: {email} · Rol: {rol}
      </p>
      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar nombre"}
      </Button>
    </form>
  );
}
