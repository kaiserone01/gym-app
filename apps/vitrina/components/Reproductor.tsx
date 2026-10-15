"use client";

import { useEffect, useMemo, useState } from "react";
import type { Almacen } from "@/lib/almacen";
import type { ManifiestoVitrina } from "@gym-app/domain/entities/Vitrina";
import { construirSecuencia } from "@gym-app/domain/services/secuenciaVitrina";
import { itemsDeManifiesto } from "@gym-app/domain/services/manifiestoVitrina";
import { estadoDeTasa } from "@gym-app/domain/utils/estadoTasa";
import { diaCalendarioCaracas } from "@gym-app/domain/utils/fechaCaracas";
import { posicionarIndice } from "@/lib/posicionarDiapositiva";
import { Cartel } from "./Cartel";
import { Franja } from "./Franja";
import { PantallaMarca } from "./PantallaMarca";

export function Reproductor({ manifiesto, almacen, ahora }: { manifiesto: ManifiestoVitrina; almacen: Almacen; ahora: Date }) {
  // La secuencia se recalcula cada minuto (y al cambiar el manifiesto): así un ítem programado entra, o uno que
  // vence sale, aunque la TV no tenga red.
  const minuto = Math.floor(ahora.getTime() / 60_000);
  const secuencia = useMemo(
    () => construirSecuencia(itemsDeManifiesto(manifiesto), new Date(minuto * 60_000), manifiesto.duracionSeg),
    [manifiesto, minuto]
  );

  // El Bs depende del estado de la tasa respecto del día de Caracas del instante efectivo (no de la hora de la TV).
  const tasa = manifiesto.tasaBcv
    ? { valor: manifiesto.tasaBcv.valor, estado: estadoDeTasa(new Date(manifiesto.tasaBcv.fecha), diaCalendarioCaracas(new Date(minuto * 60_000))) }
    : null;

  const [indice, setIndice] = useState(0);
  const [ciclo, setCiclo] = useState(0); // solo avanza al pasar de diapositiva: reposicionar no reinicia el temporizador
  const [secuenciaPrevia, setSecuenciaPrevia] = useState(secuencia);
  if (secuenciaPrevia !== secuencia) {
    // Si la secuencia cambió, la TV sigue en la misma diapositiva (por clave) en vez de saltar o repetir.
    const previa = secuenciaPrevia.length > 0 ? secuenciaPrevia[indice % secuenciaPrevia.length].clave : null;
    setSecuenciaPrevia(secuencia);
    setIndice(posicionarIndice(indice % Math.max(secuenciaPrevia.length, 1), previa, secuencia));
  }
  const actual = secuencia.length > 0 ? secuencia[indice % secuencia.length] : null;
  const claveActual = actual?.clave;
  const duracionActual = actual?.duracionSeg;

  useEffect(() => {
    if (duracionActual === undefined) return;
    const id = setTimeout(() => {
      setIndice((i) => i + 1);
      setCiclo((c) => c + 1);
    }, duracionActual * 1000);
    return () => clearTimeout(id);
  }, [claveActual, duracionActual, ciclo]);

  if (!actual) return <PantallaMarca />;

  // Con una sola diapositiva no se vuelve a montar (ni se repite la transición ni se reinician los videos).
  const clave = secuencia.length > 1 ? `${actual.clave}:${indice}` : actual.clave;

  return (
    <main key={clave} className={`h-full w-full ${manifiesto.transicion === "DESLIZAR" ? "trans-deslizar" : "trans-fundido"}`}>
      {actual.tipo === "FRANJA" ? (
        <Franja entrenadores={actual.entrenadores} duracionSeg={actual.duracionSeg} almacen={almacen} />
      ) : (
        <Cartel item={actual.item} almacen={almacen} tasa={tasa} />
      )}
    </main>
  );
}
