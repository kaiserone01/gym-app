import type { LectorBytes } from "@gym-app/domain/utils/mp4";
import { MAX_LADO_IMAGEN_VITRINA } from "@gym-app/domain/utils/imagenSubida";
import { canvasABlob } from "../miembros/comprimirImagen";

function lienzo(ancho: number, alto: number): HTMLCanvasElement {
  const escala = Math.min(1, MAX_LADO_IMAGEN_VITRINA / Math.max(ancho, alto));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(ancho * escala);
  canvas.height = Math.round(alto * escala);
  return canvas;
}

async function aArchivo(canvas: HTMLCanvasElement, tipos: Array<[string, string, number]>): Promise<File> {
  for (const [mime, nombre, calidad] of tipos) {
    const blob = await canvasABlob(canvas, mime, calidad);
    if (blob && blob.type === mime) return new File([blob], nombre, { type: mime });
  }
  throw new Error("No se pudo procesar la imagen.");
}

// Carteles y fotos de la vitrina: lado mayor ≤ 1920 px y WebP 0.85 (JPEG de respaldo). No se usa comprimirAvatar
// (reduce a 384x384): un cartel de TV necesita su resolución.
export async function comprimirParaVitrina(archivo: File): Promise<File> {
  const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  const canvas = lienzo(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return aArchivo(canvas, [["image/webp", "imagen.webp", 0.85], ["image/jpeg", "imagen.jpg", 0.85]]);
}

const MENSAJE_VIDEO =
  "No se pudo leer el video en este navegador. Prueba con otro MP4 (H.264) o con otro navegador.";
const ESPERA_VIDEO_MS = 15000;

// Espera un evento del <video>; falla con un mensaje claro si hay error o pasa demasiado tiempo (limpia sus listeners).
function esperarVideo(video: HTMLVideoElement, evento: "loadeddata" | "seeked"): Promise<void> {
  return new Promise<void>((ok, mal) => {
    const limpiar = () => {
      clearTimeout(temporizador);
      video.removeEventListener(evento, alExito);
      video.removeEventListener("error", alFallo);
    };
    const alExito = () => {
      limpiar();
      ok();
    };
    const alFallo = () => {
      limpiar();
      mal(new Error(MENSAJE_VIDEO));
    };
    const temporizador = setTimeout(alFallo, ESPERA_VIDEO_MS);
    video.addEventListener(evento, alExito);
    video.addEventListener("error", alFallo);
  });
}

// Primer fotograma del video, ya con la rotación aplicada (el <video> dibuja en la orientación mostrada).
export async function posterDeVideo(archivo: File): Promise<File> {
  const url = URL.createObjectURL(archivo);
  const video = document.createElement("video");
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const cargado = esperarVideo(video, "loadeddata");
    video.src = url;
    await cargado;
    const buscado = esperarVideo(video, "seeked");
    video.currentTime = 0.1;
    await buscado;
    const canvas = lienzo(video.videoWidth, video.videoHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await aArchivo(canvas, [["image/jpeg", "poster.jpg", 0.8]]);
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

// Lector por rangos para analizarMp4: lee solo los trozos que pide, sin cargar el video entero.
export function lectorDeArchivo(archivo: Blob): LectorBytes {
  return async (desde, largo) => new Uint8Array(await archivo.slice(desde, desde + largo).arrayBuffer());
}

export class SubidaCancelada extends Error {}

// PUT directo a R2 con las cabeceras firmadas (Content-Type y Cache-Control deben coincidir exactamente).
// Si `senal` se aborta, cancela el PUT y rechaza con SubidaCancelada.
export function subirConProgreso(
  url: string,
  archivo: Blob,
  cabeceras: Record<string, string>,
  alProgreso: (fraccion: number) => void,
  senal?: AbortSignal
): Promise<void> {
  return new Promise((ok, mal) => {
    if (senal?.aborted) return mal(new SubidaCancelada("Subida cancelada."));
    const xhr = new XMLHttpRequest();
    const cancelar = () => xhr.abort();
    senal?.addEventListener("abort", cancelar);
    const terminar = () => senal?.removeEventListener("abort", cancelar);
    xhr.open("PUT", url);
    for (const [nombre, valor] of Object.entries(cabeceras)) xhr.setRequestHeader(nombre, valor);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) alProgreso(e.loaded / e.total);
    };
    xhr.onload = () => {
      terminar();
      if (xhr.status >= 200 && xhr.status < 300) ok();
      else mal(new Error(`R2 respondió ${xhr.status}.`));
    };
    xhr.onerror = () => {
      terminar();
      mal(new Error("No se pudo subir el video (¿falta el CORS del bucket de R2 o se cortó la conexión?)."));
    };
    xhr.ontimeout = () => {
      terminar();
      mal(new Error("La subida del video tardó demasiado. Revisa la conexión e inténtalo de nuevo."));
    };
    xhr.onabort = () => {
      terminar();
      mal(new SubidaCancelada("Subida cancelada."));
    };
    xhr.send(archivo);
  });
}
