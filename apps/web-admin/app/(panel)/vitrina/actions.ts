"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { puedeEditarKiosko } from "@/lib/permisoKiosko";
import { storageR2 } from "@/lib/storageR2";
import { notificarCambioVitrina } from "@/lib/vitrinaEventos";
import { CACHE_CONTROL_INMUTABLE, CARPETA_VITRINA, esUrlDeVitrina } from "@/lib/vitrinaMedios";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { TRANSICIONES_VITRINA, type DatosVitrinaItem, type VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import type { SubidaPrefirmada } from "@gym-app/domain/ports/IArchivoStorageService";
import { rangoDiaCaracas } from "@gym-app/domain/utils/fechaCaracas";
import { extensionDeImagen, MAX_BYTES_IMAGEN_VITRINA } from "@gym-app/domain/utils/imagenSubida";
import { MAX_BYTES_VIDEO_VITRINA } from "@gym-app/domain/utils/videoVitrina";
import { DURACION_MAX_SEG, DURACION_MIN_SEG, normalizarSonido, numeroOpcional, validarVitrinaItem } from "@gym-app/domain/utils/vitrinaItem";
import { conMensajeOk } from "../redirectConMensaje";
import { SLUG_DE_TIPO } from "./slugs";

export interface EstadoFormularioVitrina {
  error?: string;
}

const SIN_PERMISO = "Solo el socio o el gerente pueden administrar la vitrina.";

// Sesión válida con permiso (mismo criterio que Kiosko); sin sesión redirige al login, sin permiso devuelve null.
async function sesionConPermiso() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  return puedeEditarKiosko(sesion.usuario.rol) ? sesion : null;
}

const repositorio = () => new PrismaVitrinaRepository(prisma);
const marcada = (formData: FormData, nombre: string) => formData.get(nombre) === "on";
const textoOpcional = (valor: FormDataEntryValue | null): string | null => valor?.toString().trim() || null;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function leerDatos(formData: FormData): { datos: DatosVitrinaItem } | { error: string } {
  const tipo = formData.get("tipo")?.toString();
  if (tipo !== "ENTRENADOR" && tipo !== "PROMO" && tipo !== "PRODUCTO") return { error: "Tipo de ítem no válido." };
  const mediaTipo = formData.get("mediaTipo")?.toString();
  if (mediaTipo !== "IMAGEN" && mediaTipo !== "VIDEO") return { error: "Falta subir la imagen o el video." };

  const inicio = textoOpcional(formData.get("inicio"));
  const fin = textoOpcional(formData.get("fin"));
  if ((inicio && !FECHA.test(inicio)) || (fin && !FECHA.test(fin))) return { error: "Fecha no válida." };

  return {
    datos: normalizarSonido({
      tipo,
      mediaTipo,
      mediaUrl: textoOpcional(formData.get("mediaUrl")) ?? "",
      posterUrl: textoOpcional(formData.get("posterUrl")),
      sonido: marcada(formData, "sonido"),
      duracionSeg: numeroOpcional(formData.get("duracionSeg")),
      inicio: inicio ? rangoDiaCaracas(inicio).inicio : null,
      fin: fin ? rangoDiaCaracas(fin).fin : null,
      precioUSD: numeroOpcional(formData.get("precioUSD")),
      ofertaUSD: numeroOpcional(formData.get("ofertaUSD")),
      descuentoPct: numeroOpcional(formData.get("descuentoPct")),
      etiqueta: textoOpcional(formData.get("etiqueta")),
      mostrarPrecio: marcada(formData, "mostrarPrecio"),
      mostrarOferta: marcada(formData, "mostrarOferta"),
      mostrarDescuento: marcada(formData, "mostrarDescuento"),
      mostrarEtiqueta: marcada(formData, "mostrarEtiqueta"),
      mostrarEquivalenteBs: marcada(formData, "mostrarEquivalenteBs"),
      nombre: textoOpcional(formData.get("nombre")),
      especialidad: textoOpcional(formData.get("especialidad")),
      frase: textoOpcional(formData.get("frase")),
      mostrarMedio: marcada(formData, "mostrarMedio"),
      mostrarNombre: marcada(formData, "mostrarNombre"),
      mostrarEspecialidad: marcada(formData, "mostrarEspecialidad"),
      mostrarFrase: marcada(formData, "mostrarFrase"),
    }),
  };
}

// Borra un archivo de R2 solo si es de la carpeta vitrina/ y ningún ítem (de cualquier sede) lo sigue usando.
// Un fallo al borrar no debe romper la acción: solo deja un archivo huérfano.
async function borrarSiNadieLoUsa(url: string, exceptoItemId?: string) {
  try {
    if (!esUrlDeVitrina(url) || (await repositorio().urlEnUso(url, exceptoItemId))) return;
    await storageR2().eliminar(url);
  } catch (error) {
    console.error("No se pudo borrar de R2:", url, error);
  }
}

// Borra de R2 los archivos de `anterior` que `nuevos` ya no usa (o todos, si no hay `nuevos`).
async function borrarArchivosSobrantes(anterior: VitrinaItem, nuevos?: DatosVitrinaItem) {
  const conservar = new Set([nuevos?.mediaUrl, nuevos?.posterUrl].filter(Boolean));
  for (const url of [anterior.mediaUrl, anterior.posterUrl]) {
    if (url && !conservar.has(url)) await borrarSiNadieLoUsa(url, anterior.id);
  }
}

// El navegador sube los videos directo a R2: aquí solo se firma la URL (el tamaño se revalida al guardar).
export async function prepararSubidaVideoAction(bytes: number): Promise<{ error?: string; subida?: SubidaPrefirmada }> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES_VIDEO_VITRINA) return { error: "El video pesa más de 100 MB." };

  const subida = await storageR2().urlPrefirmada(CARPETA_VITRINA, `${randomUUID()}.mp4`, "video/mp4", CACHE_CONTROL_INMUTABLE);
  return { subida };
}

// Fotos, carteles y pósters: el navegador ya los comprimió (≤1920 px, WebP); aquí se valida y se suben a R2.
export async function subirImagenVitrinaAction(formData: FormData): Promise<{ url?: string; error?: string }> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "No se recibió la imagen." };
  const extension = extensionDeImagen(archivo.type, archivo.size, MAX_BYTES_IMAGEN_VITRINA);
  if (!extension) return { error: "La imagen debe ser JPG, PNG o WebP de hasta 8 MB." };

  const url = await storageR2().subir(
    CARPETA_VITRINA,
    `${randomUUID()}.${extension}`,
    Buffer.from(await archivo.arrayBuffer()),
    archivo.type,
    CACHE_CONTROL_INMUTABLE
  );
  return { url };
}

export async function guardarItemAction(_estadoPrevio: EstadoFormularioVitrina, formData: FormData): Promise<EstadoFormularioVitrina> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };
  const sucursalId = sesion.sucursalActivaId;

  const leido = leerDatos(formData);
  if ("error" in leido) return { error: leido.error };
  const { datos } = leido;

  const error = validarVitrinaItem(datos);
  if (error) return { error };

  const urls = [datos.mediaUrl, datos.posterUrl].filter((url): url is string => !!url);
  if (urls.some((url) => !esUrlDeVitrina(url))) return { error: "El archivo no está en el almacenamiento de la vitrina." };

  if (datos.mediaTipo === "VIDEO") {
    // La subida fue directa a R2: se comprueba que llegó completa y con el tipo esperado antes de publicarla.
    let real: Awaited<ReturnType<ReturnType<typeof storageR2>["inspeccionar"]>>;
    try {
      real = await storageR2().inspeccionar(datos.mediaUrl);
    } catch (error) {
      console.error("No se pudo inspeccionar el video en R2:", error);
      return { error: "No se pudo comprobar el video subido. Inténtalo de nuevo." };
    }
    if (!real || real.bytes > MAX_BYTES_VIDEO_VITRINA || real.contentType !== "video/mp4") {
      await borrarSiNadieLoUsa(datos.mediaUrl);
      return { error: "El video no se subió completo o no cumple el formato. Vuelve a subirlo." };
    }
  }

  const id = formData.get("id")?.toString();
  if (id) {
    const anterior = await repositorio().buscar(sucursalId, id);
    if (!anterior) return { error: "No se encontró el ítem." };
    const actualizado = await repositorio().actualizar(sucursalId, id, datos);
    if (!actualizado) return { error: "No se encontró el ítem." };
    await borrarArchivosSobrantes(anterior, datos);
  } else {
    await repositorio().crear(sucursalId, datos);
  }

  notificarCambioVitrina(sucursalId); // después del commit: el repositorio resuelve tras la transacción
  revalidatePath("/vitrina", "layout");
  redirect(
    conMensajeOk(
      `/vitrina/${SLUG_DE_TIPO[datos.tipo]}`,
      id ? "Cambios guardados." : "Creado. Está inactivo: actívalo para mostrarlo en la TV."
    )
  );
}

export async function alternarActivoAction(formData: FormData): Promise<void> {
  const sesion = await sesionConPermiso();
  if (!sesion) return;
  const id = formData.get("id")?.toString();
  if (!id) return;

  const actualizado = await repositorio().actualizar(sesion.sucursalActivaId, id, { activo: formData.get("activo") === "true" });
  if (actualizado) notificarCambioVitrina(sesion.sucursalActivaId);
  revalidatePath("/vitrina", "layout");
}

export async function moverItemAction(formData: FormData): Promise<void> {
  const sesion = await sesionConPermiso();
  if (!sesion) return;
  const id = formData.get("id")?.toString();
  const direccion = formData.get("direccion")?.toString();
  if (!id || (direccion !== "SUBIR" && direccion !== "BAJAR")) return;

  const movido = await repositorio().mover(sesion.sucursalActivaId, id, direccion);
  if (movido) notificarCambioVitrina(sesion.sucursalActivaId);
  revalidatePath("/vitrina", "layout");
}

export async function eliminarItemAction(formData: FormData): Promise<void> {
  const sesion = await sesionConPermiso();
  if (!sesion) redirect("/miembros");
  const id = formData.get("id")?.toString();
  const volver = formData.get("volver")?.toString() ?? "";
  const destino = /^\/vitrina(\/[a-z]+)?$/.test(volver) ? volver : "/vitrina/secuencia";

  const borrado = id ? await repositorio().eliminar(sesion.sucursalActivaId, id) : null;
  if (borrado) {
    await borrarArchivosSobrantes(borrado);
    notificarCambioVitrina(sesion.sucursalActivaId);
  }
  revalidatePath("/vitrina", "layout");
  redirect(conMensajeOk(destino, "Eliminado."));
}

export async function guardarAjustesVitrinaAction(
  _estadoPrevio: EstadoFormularioVitrina,
  formData: FormData
): Promise<EstadoFormularioVitrina> {
  const sesion = await sesionConPermiso();
  if (!sesion) return { error: SIN_PERMISO };

  const duracionSeg = numeroOpcional(formData.get("duracionSeg"));
  if (duracionSeg === null || !Number.isInteger(duracionSeg) || duracionSeg < DURACION_MIN_SEG || duracionSeg > DURACION_MAX_SEG) {
    return { error: `La duración debe ser un número entero entre ${DURACION_MIN_SEG} y ${DURACION_MAX_SEG} segundos.` };
  }
  const transicion = formData.get("transicion")?.toString();
  if (!TRANSICIONES_VITRINA.some((t) => t === transicion)) return { error: "Estilo de transición no válido." };

  await repositorio().guardarAjustes(sesion.sucursalActivaId, {
    duracionSeg,
    transicion: transicion as (typeof TRANSICIONES_VITRINA)[number],
  });
  notificarCambioVitrina(sesion.sucursalActivaId);
  revalidatePath("/vitrina", "layout");
  redirect(conMensajeOk("/vitrina/ajustes", "Ajustes guardados."));
}
