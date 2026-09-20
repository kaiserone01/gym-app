// Banner de error para páginas a las que una Server Action que devuelve `void`
// redirige con `?error=<mensaje>` (esas acciones no tienen canal de useActionState).
export function AvisoError({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;

  return (
    <p
      className="rounded-lg border px-3 py-2 text-sm"
      style={{
        borderColor: "color-mix(in srgb, var(--gx-bad) 40%, transparent)",
        background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)",
        color: "var(--gx-bad)",
      }}
    >
      {mensaje}
    </p>
  );
}
