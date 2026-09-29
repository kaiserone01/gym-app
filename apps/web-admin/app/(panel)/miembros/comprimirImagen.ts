const LADO_AVATAR = 384;

function aCanvasCuadrado(fuente: CanvasImageSource, ancho: number, alto: number): HTMLCanvasElement {
  const lado = Math.min(ancho, alto);
  const canvas = document.createElement("canvas");
  canvas.width = LADO_AVATAR;
  canvas.height = LADO_AVATAR;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.imageSmoothingQuality = "high";
  // Recorte central cuadrado: coincide con la zona que se ve dentro del avatar.
  ctx.drawImage(fuente, (ancho - lado) / 2, (alto - lado) / 2, lado, lado, 0, 0, LADO_AVATAR, LADO_AVATAR);
  return canvas;
}

function canvasABlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad));
}

// Recorta al centro en cuadrado, reduce a 384x384 y comprime (WebP, con JPEG de
// respaldo). Un avatar de 80px no necesita más: pasa de varios MB a ~20-40 KB.
export async function comprimirAvatar(fuente: Blob | HTMLVideoElement): Promise<File> {
  let canvas: HTMLCanvasElement;
  if (fuente instanceof HTMLVideoElement) {
    canvas = aCanvasCuadrado(fuente, fuente.videoWidth, fuente.videoHeight);
  } else {
    const bitmap = await createImageBitmap(fuente, { imageOrientation: "from-image" });
    canvas = aCanvasCuadrado(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
  }

  const webp = await canvasABlob(canvas, "image/webp", 0.8);
  if (webp && webp.type === "image/webp") return new File([webp], "foto.webp", { type: "image/webp" });

  const jpeg = await canvasABlob(canvas, "image/jpeg", 0.8);
  if (!jpeg) throw new Error("No se pudo procesar la imagen");
  return new File([jpeg], "foto.jpg", { type: "image/jpeg" });
}
