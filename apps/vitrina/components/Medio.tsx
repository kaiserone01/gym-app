"use client";

import { useEffect, useRef, useState } from "react";
import type { Almacen } from "@/lib/almacen";
import { evaluarVideo, ultimoAvance } from "@/lib/reproduccion";
import type { TipoMedio } from "@gym-app/domain/entities/Vitrina";

interface Props {
  url: string;
  tipo: TipoMedio;
  posterUrl: string | null;
  almacen: Almacen;
  /** Solo un video reproduce a la vez en una franja: los demás muestran su póster. */
  reproducir: boolean;
  ajuste: "cover" | "contain";
  /** El video se oye (decide el panel por video). */
  sonido?: boolean;
  /** Diapositiva única: el video se reinicia al terminar en vez de avisar. */
  bucle?: boolean;
  /** El video llegó a su fin (`fallo` false) o se saltó por error, estancamiento o tope (`fallo` true). */
  alTerminar?: (fallo: boolean) => void;
}

// Siempre prefiere el archivo guardado en el equipo; la URL remota solo es el último recurso (aún no descargado).
// Un video que no carga o se atasca se sustituye por su póster.
export function Medio({ url, tipo, posterUrl, almacen, reproducir, ajuste, sonido = false, bucle = false, alTerminar }: Props) {
  const [falloVideo, setFalloVideo] = useState<string | null>(null);
  const clase = `h-full w-full ${ajuste === "cover" ? "object-cover" : "object-contain"}`;
  const fuente = almacen.rutaLocal(url) ?? url;
  const poster = posterUrl ? (almacen.rutaLocal(posterUrl) ?? posterUrl) : undefined;

  // Si le toca el turno a un video que ya había fallado (no el que acaba de fallar, que ya avisó), se muestra su póster
  // un instante y se sigue: no se reintenta en cada vuelta.
  const turnoDeFallido = tipo === "VIDEO" && reproducir && falloVideo === fuente;
  const falloEnEsteTurno = useRef(false);
  const alTerminarRef = useRef(alTerminar);
  useEffect(() => {
    alTerminarRef.current = alTerminar;
  });
  useEffect(() => {
    if (!reproducir) falloEnEsteTurno.current = false;
  }, [reproducir]);
  useEffect(() => {
    if (!turnoDeFallido || falloEnEsteTurno.current) return;
    const id = setTimeout(() => alTerminarRef.current?.(true), 1000);
    return () => clearTimeout(id);
  }, [turnoDeFallido]);

  if (tipo === "VIDEO" && reproducir && falloVideo !== fuente) {
    return (
      <VideoEnTurno
        key={fuente}
        fuente={fuente}
        poster={poster}
        clase={clase}
        sonido={sonido}
        bucle={bucle}
        alTerminar={(fallo) => {
          if (fallo) {
            falloEnEsteTurno.current = true;
            setFalloVideo(fuente);
          }
          alTerminar?.(fallo);
        }}
      />
    );
  }
  if (tipo === "VIDEO") {
    // eslint-disable-next-line @next/next/no-img-element -- póster guardado en el equipo
    return poster ? <img src={poster} alt="" className={clase} /> : <div className="h-full w-full" style={{ background: "var(--gx-surface)" }} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- imagen guardada en el equipo
  return <img src={fuente} alt="" className={clase} />;
}

function VideoEnTurno({ fuente, poster, clase, sonido, bucle, alTerminar }: { fuente: string; poster?: string; clase: string; sonido: boolean; bucle: boolean; alTerminar: (fallo: boolean) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const avisado = useRef(false);
  const bucleRef = useRef(bucle);
  const alTerminarRef = useRef(alTerminar);
  useEffect(() => {
    bucleRef.current = bucle; // el tope de 10 min se activa si la secuencia pasa de 1 a varias diapositivas
    alTerminarRef.current = alTerminar;
  });

  const terminar = (fallo: boolean) => {
    if (avisado.current) return;
    avisado.current = true;
    alTerminarRef.current(fallo);
  };

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    // El cleanup libera la fuente; el modo estricto de React (desarrollo) vuelve a ejecutar este efecto sobre el mismo
    // elemento, así que se restaura si falta.
    if (!el.getAttribute("src")) el.src = fuente;
    // Si el navegador o la WebView rechaza reproducir con sonido (autoplay), se reintenta en silencio sin romper la secuencia.
    let cancelado = false;
    el.play().catch((causa: unknown) => {
      // Solo el autoplay bloqueado (NotAllowedError) se reintenta; un AbortError al desmontar no debe arrancar nada.
      if (cancelado || !el.isConnected || !(causa instanceof DOMException) || causa.name !== "NotAllowedError") return;
      el.muted = true;
      el.play().catch(() => undefined); // si tampoco arranca, el vigilante de abajo lo salta
    });

    // Vigilante: un video que no avanza durante 20 s, o que pasa de 10 min, se salta.
    const inicioMs = Date.now();
    let ultimoAvanceMs = inicioMs;
    let tiempoPrevio = el.currentTime;
    const id = setInterval(() => {
      const ahoraMs = Date.now();
      ultimoAvanceMs = ultimoAvance(tiempoPrevio, el.currentTime, ahoraMs, ultimoAvanceMs);
      tiempoPrevio = el.currentTime;
      if (evaluarVideo({ ahoraMs, inicioMs, ultimoAvanceMs, conTope: !bucleRef.current }) !== "SEGUIR") terminar(true);
    }, 1000);
    return () => {
      cancelado = true;
      clearInterval(id);
      // Libera el decodificador: un elemento descartado no debe seguir reproduciendo.
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se monta una vez por video (key = fuente)
  }, []);

  return (
    <video
      ref={video}
      src={fuente}
      poster={poster}
      autoPlay
      muted={!sonido}
      loop={bucle}
      playsInline
      onEnded={() => terminar(false)}
      onError={() => terminar(true)}
      className={clase}
    />
  );
}
