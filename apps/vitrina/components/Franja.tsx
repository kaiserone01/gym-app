"use client";

import { useEffect, useRef, useState } from "react";
import type { Almacen } from "@/lib/almacen";
import { colaAgotada, colaDeVideos, siguienteTurno } from "@/lib/reproduccion";
import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import { Medio } from "./Medio";

// Cada columna mide siempre 1/3 de la pantalla: con 1 o 2 entrenadores se centran sin estirar las fotos. Los videos
// se reproducen uno tras otro, completos y en orden de columna (nunca dos a la vez: ni se decodifican ni suenan);
// las demás columnas muestran su póster. Al acabar el último se avisa; en una diapositiva única la cola se reinicia.
export function Franja({
  entrenadores,
  almacen,
  unica,
  alTerminarVideos,
}: {
  entrenadores: VitrinaItem[];
  almacen: Almacen;
  unica: boolean;
  alTerminarVideos: () => void;
}) {
  const cola = colaDeVideos(entrenadores);
  const [posicion, setPosicion] = useState(0);
  const idActivo = cola[posicion] ?? null;

  const finAvisado = useRef(false); // el fin de los videos se avisa una sola vez
  const avisarFin = useRef(alTerminarVideos);
  avisarFin.current = alTerminarVideos;

  function avisar() {
    if (finAvisado.current) return;
    finAvisado.current = true;
    avisarFin.current();
  }

  function videoTerminado() {
    const turno = siguienteTurno(posicion, cola.length, unica);
    setPosicion(turno.posicion);
    if (turno.terminada) avisar();
  }

  // Al pasar de diapositiva única a varias (o al revés) la franja sigue montada: se rearma el aviso de fin.
  useEffect(() => {
    finAvisado.current = false;
  }, [unica]);

  // Si la cola se acortó (cambio de secuencia con un video en curso) y la posición quedó fuera de rango, no se espera
  // un evento que ya no llegará: se da por terminada (o se reinicia, en la diapositiva única).
  useEffect(() => {
    if (!colaAgotada(posicion, cola.length)) return;
    if (unica) setPosicion(0);
    else avisar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avisar solo usa refs
  }, [posicion, cola.length, unica]);

  return (
    <div className="flex h-full w-full justify-center" style={{ background: "var(--gx-ground)" }}>
      {entrenadores.map((entrenador, columna) => (
        <section key={entrenador.id} className={`relative h-full w-1/3 overflow-hidden ${columna > 0 ? "border-l" : ""}`} style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface)" }}>
          {entrenador.mostrarMedio && (
            <Medio
              url={entrenador.mediaUrl}
              tipo={entrenador.mediaTipo}
              posterUrl={entrenador.posterUrl}
              almacen={almacen}
              reproducir={entrenador.id === idActivo}
              sonido={entrenador.sonido}
              bucle={unica && cola.length === 1}
              alTerminar={videoTerminado}
              ajuste="cover"
            />
          )}
          <div
            className="absolute inset-x-0 bottom-0 flex flex-col gap-[0.4rem] px-[3rem] pt-[8rem] pb-[3rem]"
            style={{ background: "linear-gradient(to top, rgba(10,13,7,0.95), rgba(10,13,7,0))" }}
          >
            {entrenador.mostrarNombre && entrenador.nombre && (
              <span className="titulo text-[5.5rem] leading-none" style={{ color: "var(--gx-ink)" }}>
                {entrenador.nombre}
              </span>
            )}
            {entrenador.mostrarEspecialidad && entrenador.especialidad && (
              <span className="text-[2.6rem] font-semibold uppercase" style={{ color: "var(--gx-accent)" }}>
                {entrenador.especialidad}
              </span>
            )}
            {entrenador.mostrarFrase && entrenador.frase && (
              <span className="text-[2.2rem]" style={{ color: "var(--gx-muted)" }}>
                {entrenador.frase}
              </span>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
