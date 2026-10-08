"use client";

import { useState, type ReactNode } from "react";

type Cara<T> = { tipo: "reposo" } | { tipo: "ficha"; ficha: T };

// Tarjeta con dos caras que alternan al girar: cada cambio de `ficha.id` (o volver a null)
// escribe el contenido nuevo en la cara oculta y suma 180°. Así reposo→ficha, ficha→ficha y
// ficha→reposo giran todos igual, sin pasar por reposo entre dos personas seguidas.
export function FichaGiratoria<T extends { id: number }>({
  ficha,
  renderReposo,
  renderFicha,
}: {
  ficha: T | null;
  renderReposo: () => ReactNode;
  renderFicha: (ficha: T) => ReactNode;
}) {
  const clave = ficha?.id ?? 0;
  const [estado, setEstado] = useState<{ caras: [Cara<T>, Cara<T>]; giros: number; clave: number }>({
    caras: [{ tipo: "reposo" }, { tipo: "reposo" }],
    giros: 0,
    clave,
  });

  // Estado derivado durante el render (patrón de React para "ajustar estado al cambiar una prop").
  if (clave !== estado.clave) {
    const oculta = (estado.giros + 1) % 2;
    const caras: [Cara<T>, Cara<T>] = [estado.caras[0], estado.caras[1]];
    caras[oculta] = ficha ? { tipo: "ficha", ficha } : { tipo: "reposo" };
    setEstado({ caras, giros: estado.giros + 1, clave });
  }

  // La ficha real es más angosta (68 %) que la de reposo, que usa todo el ancho de la escena. El key por id
  // remonta la ficha en cada giro y reinicia su barra de cuenta regresiva.
  const contenido = (cara: Cara<T>) =>
    cara.tipo === "reposo" ? (
      renderReposo()
    ) : (
      <div key={cara.ficha.id} className="mx-auto flex w-[68%] flex-1 flex-col">
        {renderFicha(cara.ficha)}
      </div>
    );

  return (
    <div className="flip-escena w-[92vw] min-w-[40rem] max-w-[104rem]">
      <div className="flip-tarjeta" style={{ transform: `rotateY(${estado.giros * 180}deg)` }}>
        <div className="flip-cara">{contenido(estado.caras[0])}</div>
        <div className="flip-cara flip-cara-trasera">{contenido(estado.caras[1])}</div>
      </div>
    </div>
  );
}
