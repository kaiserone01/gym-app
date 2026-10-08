"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import { OPACIDAD_MAXIMA, OPACIDAD_MINIMA } from "@gym-app/domain/utils/reposoKiosko";
import { SelectorFotoPerfil } from "../../miembros/SelectorFotoPerfil";
import { actualizarImagenReposoAction, guardarImagenReposoAction, restablecerImagenReposoAction } from "../actions";

export function FormularioImagenKiosko({
  imagenActualUrl,
  esPersonalizada,
  opacidadInicial,
}: {
  imagenActualUrl: string;
  esPersonalizada: boolean;
  opacidadInicial: number;
}) {
  const [estado, enviar, enviando] = useActionState(guardarImagenReposoAction, {});
  const { mostrarError, mostrarExito } = useFeedback();
  const [previewUrl, setPreviewUrl] = useState(imagenActualUrl);
  const [opacidad, setOpacidad] = useState(opacidadInicial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.error) mostrarError(estado.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado.error, no a mostrarError
  }, [estado.error]);

  function manejarCambioFoto(archivo: File) {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(archivo));
  }

  async function guardarAjuste(archivo: File) {
    const datos = new FormData();
    datos.set("foto", archivo);
    try {
      const resultado = await actualizarImagenReposoAction(datos);
      if (!resultado.imagenUrl) throw new Error(resultado.error ?? "No se pudo guardar el encuadre.");
      // El encuadre ya quedó guardado: se vacía el archivo oculto del selector para que el "Guardar" del
      // formulario no vuelva a subir la foto sin recortar y pise el ajuste.
      const archivoOculto = formRef.current?.querySelector<HTMLInputElement>('input[type="file"][name="foto"]');
      if (archivoOculto) archivoOculto.value = "";
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(resultado.imagenUrl);
      mostrarExito("Encuadre guardado.");
    } catch (error) {
      mostrarError(error instanceof Error ? error.message : "No se pudo guardar el encuadre.");
    }
  }

  const circulo = (
    <div className="h-40 w-40 shrink-0 overflow-hidden rounded-full" style={{ background: "var(--gx-surface-2)", border: "4px solid var(--gx-edge)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen en R2 (dominio externo) o vista previa local */}
      <img src={previewUrl} alt="" className="h-full w-full object-cover" />
    </div>
  );

  return (
    <form ref={formRef} action={enviar} className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        {circulo}
        <SelectorFotoPerfil
          tieneFoto
          fotoActualUrl={previewUrl}
          alGuardarAjuste={guardarAjuste}
          onCambio={manejarCambioFoto}
          etiqueta="Imagen del reposo"
          guiaCircular={false}
        />
      </div>

      <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
        Opacidad del fondo: {opacidad} %
        <input
          type="range"
          name="opacidad"
          min={OPACIDAD_MINIMA}
          max={OPACIDAD_MAXIMA}
          step={5}
          value={opacidad}
          onChange={(e) => setOpacidad(Number(e.target.value))}
          style={{ accentColor: "var(--gx-accent)" }}
        />
      </label>

      {/* Vista previa: ondas simuladas detrás de una caja con el mismo rgba que usa el kiosco (fondoFicha). */}
      <div
        className="rounded-xl p-4"
        style={{ background: "repeating-linear-gradient(135deg, #0a0d07 0 16px, #1f3a12 16px 32px)" }}
      >
        <div
          className="flex items-center gap-4 rounded-xl border p-4"
          style={{ background: `rgba(18, 22, 13, ${opacidad / 100})`, borderColor: "var(--gx-edge)" }}
        >
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen en R2 (dominio externo) o vista previa local */}
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          </div>
          <span className="text-2xl" style={{ fontFamily: '"Bebas Neue", sans-serif', color: "var(--gx-ink)" }}>
            FRASE DE EJEMPLO
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
        {esPersonalizada && (
          <Button type="submit" variant="secundario" formAction={restablecerImagenReposoAction}>
            Restablecer imagen original
          </Button>
        )}
      </div>
    </form>
  );
}
