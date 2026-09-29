"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { comprimirAvatar } from "./comprimirImagen";

// Mantiene un <input type="file" name="foto"> oculto con la imagen ya
// comprimida, para que siga viajando en el FormData del formulario.
export function SelectorFotoPerfil({
  tieneFoto,
  onCambio,
  etiqueta = "Foto de perfil",
  guiaCircular = true,
  camaraInicial = "user",
}: {
  tieneFoto: boolean;
  onCambio: (archivo: File) => void;
  etiqueta?: string;
  // La guía circular ayuda a centrar un rostro; para productos no aplica.
  guiaCircular?: boolean;
  // Cámara con la que abre: "user" = frontal (selfies), "environment" = trasera (objetos).
  camaraInicial?: "user" | "environment";
}) {
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const [camara, setCamara] = useState<"user" | "environment">(camaraInicial);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  function detenerCamara() {
    streamRef.current?.getTracks().forEach((pista) => pista.stop());
    streamRef.current = null;
  }

  useEffect(() => detenerCamara, []);

  useEffect(() => {
    if (!camaraAbierta) return;
    let cancelado = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: camara }, width: { ideal: 720 }, height: { ideal: 720 } } })
      .then((stream) => {
        if (cancelado) {
          stream.getTracks().forEach((pista) => pista.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        setCamaraAbierta(false);
        setError("No se pudo acceder a la cámara. Revisa los permisos o usa \"Subir foto\".");
      });
    return () => {
      cancelado = true;
      detenerCamara();
    };
  }, [camaraAbierta, camara]);

  function abrirCamara() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite usar la cámara. Usa \"Subir foto\".");
      return;
    }
    setCamaraAbierta(true);
  }

  async function aplicar(fuente: Blob | HTMLVideoElement) {
    setProcesando(true);
    setError(null);
    try {
      const archivo = await comprimirAvatar(fuente);
      if (inputFotoRef.current) {
        const transferencia = new DataTransfer();
        transferencia.items.add(archivo);
        inputFotoRef.current.files = transferencia.files;
      }
      onCambio(archivo);
      setCamaraAbierta(false);
    } catch {
      setError("No se pudo procesar la imagen. Intenta con otra.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm" style={{ color: "var(--gx-muted)" }}>
        {etiqueta}
      </span>

      <input ref={inputFotoRef} type="file" name="foto" hidden tabIndex={-1} />
      <input
        ref={inputArchivoRef}
        type="file"
        accept="image/*"
        hidden
        tabIndex={-1}
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = "";
          if (archivo) void aplicar(archivo);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secundario" disabled={procesando} onClick={() => inputArchivoRef.current?.click()}>
          {tieneFoto ? "Cambiar foto" : "Subir foto"}
        </Button>
        <Button type="button" variant="secundario" disabled={procesando} onClick={abrirCamara}>
          Tomar foto
        </Button>
      </div>

      <p className="text-xs" style={{ color: "var(--gx-muted-dim)" }}>
        Se ajusta a formato cuadrado y liviano automáticamente.
      </p>
      {error && (
        <p className="text-xs" style={{ color: "var(--gx-bad)" }}>
          {error}
        </p>
      )}

      {camaraAbierta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "color-mix(in srgb, black 60%, transparent)" }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-4"
            style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface)" }}
          >
            <h3 className="mb-3 text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
              Tomar foto
            </h3>
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${camara === "user" ? "-scale-x-100" : ""}`}
              />
              {/* Guía: el avatar es un círculo dentro del cuadrado; lo de afuera queda oscurecido. */}
              {guiaCircular && (
                <div
                  className="pointer-events-none absolute inset-[4%] rounded-full border-2"
                  style={{ borderColor: "var(--gx-accent)", boxShadow: "0 0 0 999px rgba(0,0,0,0.55)" }}
                />
              )}
            </div>
            <p className="mt-2 text-center text-xs" style={{ color: "var(--gx-muted)" }}>
              {guiaCircular ? "Centra el rostro dentro del círculo." : "Centra el producto en el cuadro."}
            </p>
            <Button
              type="button"
              variant="secundario"
              className="mt-3 w-full"
              onClick={() => setCamara((actual) => (actual === "user" ? "environment" : "user"))}
            >
              Cambiar cámara ({camara === "user" ? "frontal" : "trasera"})
            </Button>
            <div className="mt-3 flex gap-3">
              <Button type="button" variant="secundario" className="flex-1" onClick={() => setCamaraAbierta(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={procesando}
                onClick={() => videoRef.current && void aplicar(videoRef.current)}
              >
                Capturar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
