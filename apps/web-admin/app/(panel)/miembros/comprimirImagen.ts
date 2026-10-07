const LADO_AVATAR = 384;

// Zona a recortar del cuadrado central de la fuente: `zoom` ≥ 1 y centro (cx, cy)
// como fracción 0..1 de ese cuadrado. Por defecto, el cuadrado completo.
// `luz` corrige la exposición (1 = sin cambio): subirla aclara un rostro a contraluz.
export type Recorte = { zoom: number; cx: number; cy: number; luz?: number };

// Mismo filtro para la vista previa (CSS) y para el canvas, así lo que se ve es lo que se guarda.
export function filtroLuz(luz: number): string {
  return `brightness(${luz})`;
}

function aCanvasCuadrado(fuente: CanvasImageSource, ancho: number, alto: number, recorte?: Recorte): HTMLCanvasElement {
  const lado = Math.min(ancho, alto);
  const { zoom, cx, cy, luz } = recorte ?? { zoom: 1, cx: 0.5, cy: 0.5 };
  const canvas = document.createElement("canvas");
  canvas.width = LADO_AVATAR;
  canvas.height = LADO_AVATAR;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.imageSmoothingQuality = "high";
  // ctx.filter no existe en Safari: allí la luz se ignora al guardar.
  if (luz) ctx.filter = filtroLuz(luz);
  const zona = lado / zoom;
  const x = (ancho - lado) / 2 + cx * lado - zona / 2;
  const y = (alto - lado) / 2 + cy * lado - zona / 2;
  ctx.drawImage(fuente, x, y, zona, zona, 0, 0, LADO_AVATAR, LADO_AVATAR);
  return canvas;
}

function canvasABlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad));
}

// Recorta al centro en cuadrado, reduce a 384x384 y comprime (WebP, con JPEG de
// respaldo). Un avatar de 80px no necesita más: pasa de varios MB a ~20-40 KB.
export async function comprimirAvatar(fuente: Blob | HTMLVideoElement, recorte?: Recorte): Promise<File> {
  let canvas: HTMLCanvasElement;
  if (fuente instanceof HTMLVideoElement) {
    canvas = aCanvasCuadrado(fuente, fuente.videoWidth, fuente.videoHeight, recorte);
  } else {
    const bitmap = await createImageBitmap(fuente, { imageOrientation: "from-image" });
    canvas = aCanvasCuadrado(bitmap, bitmap.width, bitmap.height, recorte);
    bitmap.close();
  }

  const webp = await canvasABlob(canvas, "image/webp", 0.8);
  if (webp && webp.type === "image/webp") return new File([webp], "foto.webp", { type: "image/webp" });

  const jpeg = await canvasABlob(canvas, "image/jpeg", 0.8);
  if (!jpeg) throw new Error("No se pudo procesar la imagen");
  return new File([jpeg], "foto.jpg", { type: "image/jpeg" });
}
