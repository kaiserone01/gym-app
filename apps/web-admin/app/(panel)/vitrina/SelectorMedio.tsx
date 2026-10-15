"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { TipoMedio, TipoVitrinaItem } from "@gym-app/domain/entities/Vitrina";
import { analizarMp4 } from "@gym-app/domain/utils/mp4";
import { validarVideo } from "@gym-app/domain/utils/videoVitrina";
import { prepararSubidaVideoAction, subirImagenVitrinaAction } from "./actions";
import { comprimirParaVitrina, lectorDeArchivo, posterDeVideo, SubidaCancelada, subirConProgreso } from "./medios";

interface Medio {
  mediaUrl: string;
  mediaTipo: TipoMedio;
  posterUrl: string | null;
}

async function subirImagen(archivo: File): Promise<string> {
  const datos = new FormData();
  datos.set("archivo", archivo);
  const resultado = await subirImagenVitrinaAction(datos);
  if (!resultado.url) throw new Error(resultado.error ?? "No se pudo subir la imagen.");
  return resultado.url;
}

// `alOcupar` avisa al formulario para deshabilitar "Guardar" mientras se procesa o sube un archivo.
export function SelectorMedio({
  tipoItem,
  inicial,
  alOcupar,
}: {
  tipoItem: TipoVitrinaItem;
  inicial?: Medio;
  alOcupar?: (ocupado: boolean) => void;
}) {
  const [medio, setMedio] = useState<Medio | null>(inicial ?? null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mostrarError } = useFeedback();
  const controlador = useRef<AbortController | null>(null);

  // Si el componente se desmonta a mitad de una subida, se aborta el PUT.
  useEffect(() => () => controlador.current?.abort(), []);

  async function elegir(archivo: File) {
    setOcupado(true);
    alOcupar?.(true);
    setProgreso(null);
    setError(null);
    let subiendoVideo = false; // desde el PUT del video, un fallo deja el selector sin medio
    try {
      if (archivo.type.startsWith("image/")) {
        setMedio({ mediaUrl: await subirImagen(await comprimirParaVitrina(archivo)), mediaTipo: "IMAGEN", posterUrl: null });
        return;
      }
      // Video: se valida antes de subir (la subida va directa a R2 y el servidor no lo ve).
      const info = await analizarMp4(lectorDeArchivo(archivo), archivo.size);
      const motivo = validarVideo(info, archivo.size, tipoItem === "ENTRENADOR");
      if (motivo) throw new Error(motivo);

      const poster = await posterDeVideo(archivo); // se genera aquí (falla pronto si el navegador no lee el video), pero se sube al final
      const preparada = await prepararSubidaVideoAction(archivo.size);
      if (!preparada.subida) throw new Error(preparada.error ?? "No se pudo preparar la subida.");
      subiendoVideo = true;
      setProgreso(0);
      controlador.current = new AbortController();
      await subirConProgreso(preparada.subida.urlSubida, archivo, preparada.subida.cabeceras, setProgreso, controlador.current.signal);
      // El póster se sube solo cuando el video ya está en R2. Si esto falla, el video queda huérfano en el bucket: es
      // inherente a la subida directa (el servidor no lo conoce hasta guardar) y no se guarda un ítem a medias.
      setProgreso(null);
      const posterUrl = await subirImagen(poster);
      setMedio({ mediaUrl: preparada.subida.urlPublica, mediaTipo: "VIDEO", posterUrl });
    } catch (causa) {
      if (subiendoVideo) setMedio(null);
      if (causa instanceof SubidaCancelada) return;
      const mensaje = causa instanceof Error ? causa.message : "No se pudo subir el archivo.";
      setError(mensaje);
      mostrarError(mensaje);
    } finally {
      controlador.current = null;
      setOcupado(false);
      alOcupar?.(false);
      setProgreso(null);
    }
  }

  const vista = medio?.mediaTipo === "VIDEO" ? medio.posterUrl : medio?.mediaUrl;

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="mediaUrl" value={medio?.mediaUrl ?? ""} />
      <input type="hidden" name="mediaTipo" value={medio?.mediaTipo ?? ""} />
      <input type="hidden" name="posterUrl" value={medio?.posterUrl ?? ""} />

      <label htmlFor="archivo-vitrina" className="text-sm" style={{ color: "var(--gx-muted)" }}>
        {tipoItem === "ENTRENADOR" ? "Foto o video vertical (MP4 H.264)" : "Cartel: imagen o video (MP4 H.264)"}
      </label>

      {vista && (
        <div className="h-48 w-32 overflow-hidden rounded-lg border" style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen en R2 (dominio externo) */}
          <img src={vista} alt="" className="h-full w-full object-contain" />
        </div>
      )}
      {medio?.mediaTipo === "VIDEO" && <p className="text-sm" style={{ color: "var(--gx-good)" }}>Video cargado.</p>}

      <input
        id="archivo-vitrina"
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        disabled={ocupado}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "error-archivo-vitrina" : undefined}
        className="max-w-full cursor-pointer text-sm"
        style={{ color: "var(--gx-ink)" }}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void elegir(archivo);
          e.target.value = "";
        }}
      />
      {ocupado && (
        <p className="text-sm" style={{ color: "var(--gx-muted)" }} role="status">
          {progreso === null ? "Procesando…" : `Subiendo video… ${Math.round(progreso * 100)} %`}
        </p>
      )}
      {ocupado && progreso !== null && (
        <div>
          <Button type="button" variant="secundario" onClick={() => controlador.current?.abort()}>
            Cancelar subida
          </Button>
        </div>
      )}
      {error && !ocupado && (
        <p id="error-archivo-vitrina" className="text-sm" style={{ color: "var(--gx-bad)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
