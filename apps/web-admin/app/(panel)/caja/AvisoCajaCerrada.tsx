import Link from "next/link";
import { Button } from "@gym-app/ui/components/Button";

// Se muestra en vez del formulario de alta/cobro cuando el usuario no
// tiene un turno abierto — inscribir un miembro o cobrar una mensualidad
// vencida son operaciones de caja y deben quedar asociadas a un turno
// para el cuadre (ver ObtenerResumenTurno/CerrarTurno), así que no se
// permiten sin uno abierto (ver diseño acordado).
export function AvisoCajaCerrada({
  mensaje = "Para inscribir un miembro o registrar un pago primero tenés que abrir la caja.",
}: {
  mensaje?: string;
}) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-2xl border p-5 text-sm"
      style={{ borderColor: "var(--gx-warn)", background: "color-mix(in srgb, var(--gx-warn) 12%, transparent)" }}
    >
      <p style={{ color: "var(--gx-ink)" }}>{mensaje}</p>
      <Link href="/caja">
        <Button type="button">Abrir turno</Button>
      </Link>
    </div>
  );
}
