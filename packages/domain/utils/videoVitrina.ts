import type { InfoMp4 } from "./mp4";

export const MAX_BYTES_VIDEO_VITRINA = 100 * 1024 * 1024;
export const MAX_LADO_MAYOR_VIDEO = 1920;
export const MAX_LADO_MENOR_VIDEO = 1080;
export const CODECS_H264 = ["avc1", "avc3"];
const CODECS_HEVC = ["hvc1", "hev1"];

// Mensaje de error si el video no sirve para la TV, o null. Las dimensiones ya vienen con la rotación aplicada.
export function validarVideo(info: InfoMp4, bytes: number, soloVertical: boolean): string | null {
  if (bytes > MAX_BYTES_VIDEO_VITRINA) return "El video pesa más de 100 MB.";
  if (!CODECS_H264.includes(info.codec)) {
    const base = "El video debe estar en formato H.264 (MP4).";
    return CODECS_HEVC.includes(info.codec)
      ? `${base} Parece HEVC (el formato por defecto del iPhone): en el iPhone usa Ajustes > Cámara > Formatos > "Más compatible", o conviértelo a H.264 (por ejemplo con HandBrake).`
      : `${base} Conviértelo a H.264 (por ejemplo con HandBrake).`;
  }
  const mayor = Math.max(info.anchoMostrado, info.altoMostrado);
  const menor = Math.min(info.anchoMostrado, info.altoMostrado);
  if (mayor > MAX_LADO_MAYOR_VIDEO || menor > MAX_LADO_MENOR_VIDEO) {
    return `El video supera 1080x1920 (el suyo es ${info.anchoMostrado}x${info.altoMostrado}). Redúcelo a 1080p.`;
  }
  if (soloVertical && info.altoMostrado < info.anchoMostrado) return "Los videos de entrenadores deben ser verticales.";
  return null;
}
