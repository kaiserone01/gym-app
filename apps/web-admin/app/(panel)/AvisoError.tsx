// Banner de error para páginas a las que una Server Action que devuelve `void`
// redirige con `?error=<mensaje>` (esas acciones no tienen canal de useActionState).
export function AvisoError({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;

  return (
    <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{mensaje}</p>
  );
}
