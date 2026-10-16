"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Almacen } from "@/lib/almacen";
import type { ManifiestoVitrina } from "@gym-app/domain/entities/Vitrina";
import { construirSecuencia } from "@gym-app/domain/services/secuenciaVitrina";
import { itemsDeManifiesto } from "@gym-app/domain/services/manifiestoVitrina";
import { estadoDeTasa } from "@gym-app/domain/utils/estadoTasa";
import { diaCalendarioCaracas } from "@gym-app/domain/utils/fechaCaracas";
import { posicionarIndice } from "@/lib/posicionarDiapositiva";
import { colaDeVideos, msParaAvanzar, techoDiapositivaMs } from "@/lib/reproduccion";
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

  // Con una sola diapositiva los videos se repiten y el temporizador solo la mantiene viva.
  const unica = secuencia.length === 1;
  const videos = actual === null ? 0 : actual.tipo === "FRANJA" ? colaDeVideos(actual.entrenadores).length : actual.item.mediaTipo === "VIDEO" ? 1 : 0;
  const conVideo = !unica && videos > 0;
  const esFranja = actual?.tipo === "FRANJA";
  // Identifica cada paso por la diapositiva (`ciclo` distingue vueltas de la misma): reposicionar no lo cambia.
  const turno = claveActual === undefined ? null : `${claveActual}#${ciclo}`;
  const [videosListos, setVideosListos] = useState<{ turno: string; fallo: boolean } | null>(null);
  const terminados = videosListos !== null && videosListos.turno === turno;
  const inicioTurnoMs = useRef(Date.now());

  useEffect(() => {
    inicioTurnoMs.current = Date.now();
  }, [turno]);

  useEffect(() => {
    if (duracionActual === undefined) return;
    const restante = msParaAvanzar({
      conVideo,
      esFranja,
      videosTerminados: terminados,
      huboFallo: terminados && (videosListos?.fallo ?? false),
      transcurridoMs: Date.now() - inicioTurnoMs.current,
      duracionSeg: duracionActual,
    });
    // Espera al evento de fin del último video, pero con un techo absoluto para que la TV nunca quede pegada.
    const espera = restante ?? Math.max(0, techoDiapositivaMs(videos, duracionActual) - (Date.now() - inicioTurnoMs.current));
    const id = setTimeout(() => {
      setIndice((i) => i + 1);
      setCiclo((c) => c + 1);
    }, espera);
    return () => clearTimeout(id);
  }, [turno, duracionActual, conVideo, esFranja, terminados, videosListos, videos]);

  if (!actual) return <PantallaMarca />;

  const alTerminarVideos = (fallo: boolean) => turno !== null && setVideosListos({ turno, fallo });

  // La clave es la de la diapositiva: si la secuencia cambia pero la actual sigue, no se vuelve a montar (el video no
  // se corta); con una sola diapositiva tampoco se repite la transición.
  return (
    <main key={actual.clave} className={`h-full w-full ${manifiesto.transicion === "DESLIZAR" ? "trans-deslizar" : "trans-fundido"}`}>
      {actual.tipo === "FRANJA" ? (
        <Franja entrenadores={actual.entrenadores} almacen={almacen} unica={unica} alTerminarVideos={() => alTerminarVideos(false)} />
      ) : (
        <Cartel item={actual.item} almacen={almacen} tasa={tasa} bucle={unica} alTerminarVideo={alTerminarVideos} />
      )}
    </main>
  );
}
