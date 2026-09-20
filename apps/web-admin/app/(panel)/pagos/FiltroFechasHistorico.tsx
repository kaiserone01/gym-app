"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SelectorRangoFechas } from "@gym-app/ui/components/SelectorRangoFechas";

// OJO: nunca usar fecha.toISOString() acá — convierte a UTC primero, y de
// noche (pasadas las 8pm en Venezuela, UTC-4) eso salta al día siguiente.
function formatearFechaISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export function FiltroFechasHistorico({
  desde,
  hasta,
  diasConActividadISO,
}: {
  desde: Date;
  hasta: Date;
  // Cada string es YYYY-MM-DD (sin componente de zona) — nunca un ISO
  // completo con hora/Z. Ver el comentario de formatearFechaISO en
  // pagos/page.tsx: un Date "sin hora" serializado con .toISOString() (que
  // sí lleva Z) puede reconstruirse como el día anterior en el navegador,
  // que corre en la misma zona (America/Caracas) pero interpreta el
  // sufijo Z como UTC.
  diasConActividadISO: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const diasConActividad = diasConActividadISO.map((fechaISO) => new Date(`${fechaISO}T00:00:00`));

  function manejarCambio(nuevoDesde: Date, nuevoHasta: Date) {
    const params = new URLSearchParams(searchParams);
    params.set("desde", formatearFechaISO(nuevoDesde));
    params.set("hasta", formatearFechaISO(nuevoHasta));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <SelectorRangoFechas desde={desde} hasta={hasta} diasConActividad={diasConActividad} onCambiar={manejarCambio} />
  );
}
