"use client";

import { useEffect, useState } from "react";
import type { Almacen } from "@/lib/almacen";
import { idVideoActivo, msPorTurno } from "@/lib/rotarVideo";
import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import { Medio } from "./Medio";

// Cada columna mide siempre 1/3 de la pantalla: con 1 o 2 entrenadores se centran sin estirar las fotos. En cada
// franja reproduce un solo video a la vez (el decodificado simultáneo cansa a los TV box modestos); la columna
// activa rota cada duración/número de videos y las demás muestran su póster.
export function Franja({ entrenadores, duracionSeg, almacen }: { entrenadores: VitrinaItem[]; duracionSeg: number; almacen: Almacen }) {
  const idsConVideo = entrenadores.filter((e) => e.mostrarMedio && e.mediaTipo === "VIDEO").map((e) => e.id);
  const [turno, setTurno] = useState(0);
  const cantidad = idsConVideo.length;

  useEffect(() => {
    if (cantidad < 2) return;
    const id = setInterval(() => setTurno((t) => t + 1), msPorTurno(duracionSeg, cantidad));
    return () => clearInterval(id);
  }, [cantidad, duracionSeg]);

  const idActivo = idVideoActivo(idsConVideo, turno);

  return (
    <div className="flex h-full w-full justify-center" style={{ background: "var(--gx-ground)" }}>
      {entrenadores.map((entrenador, posicion) => (
        <section key={entrenador.id} className={`relative h-full w-1/3 overflow-hidden ${posicion > 0 ? "border-l" : ""}`} style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface)" }}>
          {entrenador.mostrarMedio && (
            <Medio
              url={entrenador.mediaUrl}
              tipo={entrenador.mediaTipo}
              posterUrl={entrenador.posterUrl}
              almacen={almacen}
              reproducir={entrenador.id === idActivo}
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
