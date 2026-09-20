"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { EstadoFormularioUsuario } from "./actions";
import type { SucursalResumen } from "@gym-app/domain/entities/SucursalResumen";

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

function CampoFoto({ nombreActual, fotoUrlActual }: { nombreActual: string; fotoUrlActual?: string | null }) {
  const [fotoPreview, setFotoPreview] = useState<string | null>(fotoUrlActual ?? null);

  return (
    <div className="flex items-center gap-4">
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-semibold"
        style={{ background: "var(--gx-surface-2)", color: "var(--gx-muted)" }}
      >
        {fotoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo elegido en el cliente, no un asset del proyecto
          <img src={fotoPreview} alt="" className="h-full w-full object-cover" />
        ) : (
          iniciales(nombreActual || "?")
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
        Foto de perfil
        <input
          type="file"
          name="foto"
          accept="image/*"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) setFotoPreview(URL.createObjectURL(archivo));
          }}
          className="text-sm file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          style={{ color: "var(--gx-muted)" }}
        />
      </label>
    </div>
  );
}

export function FormularioUsuario({
  accion,
  sucursales,
}: {
  accion: (estado: EstadoFormularioUsuario, formData: FormData) => Promise<EstadoFormularioUsuario>;
  sucursales: SucursalResumen[];
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarError } = useFeedback();

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

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

      <CampoFoto nombreActual="" />
      <Input name="nombre" label="Nombre" required />
      <Input name="email" label="Email" type="email" required />
      <Input name="telefono" label="Teléfono (opcional)" type="tel" />
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
  telefonoInicial,
  fotoUrlActual,
}: {
  accion: (estado: EstadoFormularioUsuario, formData: FormData) => Promise<EstadoFormularioUsuario>;
  nombreInicial: string;
  email: string;
  rol: string;
  telefonoInicial: string | null;
  fotoUrlActual: string | null;
}) {
  const [estado, enviar, enviando] = useActionState(accion, {});
  const { mostrarExito, mostrarError } = useFeedback();

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  useEffect(() => {
    if (estado.ok) mostrarExito(estado.ok);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.ok, no a mostrarExito
  }, [estado.ok]);

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
      <CampoFoto nombreActual={nombreInicial} fotoUrlActual={fotoUrlActual} />
      <Input name="nombre" label="Nombre" required defaultValue={nombreInicial} />
      <Input name="telefono" label="Teléfono (opcional)" type="tel" defaultValue={telefonoInicial ?? ""} />
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        Email: {email} · Rol: {rol}
      </p>
      <Button type="submit" disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
