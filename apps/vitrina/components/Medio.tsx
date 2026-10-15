"use client";

import { useState } from "react";
import type { Almacen } from "@/lib/almacen";
import type { TipoMedio } from "@gym-app/domain/entities/Vitrina";

interface Props {
  url: string;
  tipo: TipoMedio;
  posterUrl: string | null;
  almacen: Almacen;
  /** Solo un video reproduce a la vez en una franja: los demás muestran su póster. */
  reproducir: boolean;
  ajuste: "cover" | "contain";
}

// Siempre prefiere el archivo guardado en el equipo; la URL remota solo es el último recurso (aún no descargado).
// Un video que no carga se sustituye por su póster.
export function Medio({ url, tipo, posterUrl, almacen, reproducir, ajuste }: Props) {
  const [falloVideo, setFalloVideo] = useState<string | null>(null);
  const clase = `h-full w-full ${ajuste === "cover" ? "object-cover" : "object-contain"}`;
  const fuente = almacen.rutaLocal(url) ?? url;
  const poster = posterUrl ? (almacen.rutaLocal(posterUrl) ?? posterUrl) : undefined;

  if (tipo === "VIDEO" && reproducir && falloVideo !== fuente) {
    return <video key={fuente} src={fuente} poster={poster} autoPlay muted loop playsInline onError={() => setFalloVideo(fuente)} className={clase} />;
  }
  if (tipo === "VIDEO") {
    // eslint-disable-next-line @next/next/no-img-element -- póster guardado en el equipo
    return poster ? <img src={poster} alt="" className={clase} /> : <div className="h-full w-full" style={{ background: "var(--gx-surface)" }} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- imagen guardada en el equipo
  return <img src={fuente} alt="" className={clase} />;
}
