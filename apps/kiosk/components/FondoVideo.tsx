"use client";

import { useEffect, useRef } from "react";
import type { Tono } from "@/lib/cara";

export interface Reaccion {
  // Cambia en cada verificación para reiniciar el destello y la aceleración.
  id: number;
  tono: Tono;
}

const VELOCIDAD_PICO = 1.8;
const DURACION_REACCION_MS = 1_500;

// Video de fondo en bucle. `muted` + `playsInline` son obligatorios para que el autoplay funcione en
// navegador, PWA, WebView2 y Android TV (el mp4 puede traer pista de audio). El póster evita el
// negro al cargar. Al validar una cédula acelera a VELOCIDAD_PICO y vuelve a 1x, y lanza un
// destello radial del color del resultado.
export function FondoVideo({ reaccion }: { reaccion: Reaccion | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!reaccion || !video) return;

    const inicio = performance.now();
    let cuadro = 0;
    const paso = (ahora: number) => {
      const avance = Math.min((ahora - inicio) / DURACION_REACCION_MS, 1);
      video.playbackRate = VELOCIDAD_PICO - (VELOCIDAD_PICO - 1) * avance;
      if (avance < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);

    return () => {
      cancelAnimationFrame(cuadro);
      video.playbackRate = 1;
    };
  }, [reaccion]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/branding/backgound.jpg"
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover"
      >
        <source src="/branding/backgound1.mp4" type="video/mp4" />
      </video>
      {reaccion && <div key={reaccion.id} className={`destello destello-${reaccion.tono}`} aria-hidden />}
    </>
  );
}
