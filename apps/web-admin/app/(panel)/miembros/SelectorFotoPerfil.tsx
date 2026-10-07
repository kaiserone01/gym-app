"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { comprimirAvatar } from "./comprimirImagen";

// Teléfono o tableta (donde hay cámara frontal y trasera) vs. computadora, donde
// el cambio de cámara no aplica. userAgentData existe en Chrome/Edge/Android; el
// resto (Safari en iPhone/iPad) se detecta por el user agent y, para iPadOS que se
// identifica como Mac, por la pantalla táctil.
function detectarMovil(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (typeof nav.userAgentData?.mobile === "boolean") return nav.userAgentData.mobile;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

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
  // Se decide al abrir la cámara (no al montar) para no tocar `navigator` en el servidor.
  const [esMovil, setEsMovil] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  // Zoom del encuadre y desplazamiento (fracción del ancho de la vista previa) al arrastrar.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const arrastre = useRef<{ x: number; y: number } | null>(null);

  const espejo = !esMovil || camara === "user";

  // El desplazamiento no puede dejar bordes vacíos: máximo (zoom - 1) / 2.
  function limitarPan(p: { x: number; y: number }, z: number) {
    const max = (z - 1) / 2;
    return { x: Math.max(-max, Math.min(max, p.x)), y: Math.max(-max, Math.min(max, p.y)) };
  }

  function cambiarZoom(z: number) {
    setZoom(z);
    setPan((p) => limitarPan(p, z));
  }

  function detenerCamara() {
    streamRef.current?.getTracks().forEach((pista) => pista.stop());
    streamRef.current = null;
  }

  useEffect(() => detenerCamara, []);

  useEffect(() => {
    if (!camaraAbierta) return;
    let cancelado = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          // En computadora se usa la cámara que haya, sin elegir frontal/trasera.
          ...(esMovil ? { facingMode: { ideal: camara } } : {}),
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
      })
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
  }, [camaraAbierta, camara, esMovil]);

  function abrirCamara() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador no permite usar la cámara. Usa \"Subir foto\".");
      return;
    }
    setEsMovil(detectarMovil());
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCamaraAbierta(true);
  }

  async function aplicar(fuente: Blob | HTMLVideoElement) {
    setProcesando(true);
    setError(null);
    try {
      // La vista previa está en espejo (cámara frontal): el eje X se invierte hacia la imagen real.
      const recorte = {
        zoom,
        cx: 0.5 + (espejo ? pan.x : -pan.x) / zoom,
        cy: 0.5 - pan.y / zoom,
      };
      const archivo = await comprimirAvatar(fuente, recorte);
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
            className="marca-agua-modal w-full max-w-sm rounded-2xl border p-4"
            style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface)" }}
          >
            <h3 className="mb-3 text-lg font-bold" style={{ color: "var(--gx-ink)" }}>
              Tomar foto
            </h3>
            <div
              className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden rounded-xl bg-black active:cursor-grabbing"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                arrastre.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerMove={(e) => {
                if (!arrastre.current) return;
                const ancho = e.currentTarget.clientWidth;
                const dx = (e.clientX - arrastre.current.x) / ancho;
                const dy = (e.clientY - arrastre.current.y) / ancho;
                arrastre.current = { x: e.clientX, y: e.clientY };
                setPan((p) => limitarPan({ x: p.x + dx, y: p.y + dy }, zoom));
              }}
              onPointerUp={() => (arrastre.current = null)}
              onPointerCancel={() => (arrastre.current = null)}
            >
              <div
                className="h-full w-full"
                style={{ transform: `translate(${pan.x * 100}%, ${pan.y * 100}%) scale(${zoom})` }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-cover ${espejo ? "-scale-x-100" : ""}`}
                />
              </div>
              {/* Guía: el avatar es un círculo dentro del cuadrado; lo de afuera queda oscurecido. */}
              {guiaCircular && (
                <div
                  className="pointer-events-none absolute inset-[4%] rounded-full border-2"
                  style={{ borderColor: "var(--gx-accent)", boxShadow: "0 0 0 999px rgba(0,0,0,0.55)" }}
                />
              )}
            </div>
            <label className="mt-3 flex items-center gap-3 text-xs" style={{ color: "var(--gx-muted)" }}>
              Zoom
              <input
                type="range"
                min={1}
                max={4}
                step={0.05}
                value={zoom}
                onChange={(e) => cambiarZoom(Number(e.target.value))}
                className="min-w-0 flex-1"
                style={{ accentColor: "var(--gx-accent)" }}
              />
              {zoom.toFixed(1)}x
            </label>
            <p className="mt-2 text-center text-xs" style={{ color: "var(--gx-muted)" }}>
              {guiaCircular
                ? "Acerca con el zoom y arrastra la imagen hasta centrar el rostro dentro del círculo."
                : "Centra el producto en el cuadro."}
            </p>
            {esMovil && (
              <Button
                type="button"
                variant="secundario"
                className="mt-3 w-full"
                onClick={() => setCamara((actual) => (actual === "user" ? "environment" : "user"))}
              >
                Cambiar cámara ({camara === "user" ? "frontal" : "trasera"})
              </Button>
            )}
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
