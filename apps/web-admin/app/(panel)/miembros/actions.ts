"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { crearMiembro, CedulaDuplicadaError } from "@gym-app/domain/use-cases/CrearMiembro";
import { actualizarMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ActualizarMiembro";
import type { PlanTipo } from "@gym-app/domain/entities/Miembro";

export interface EstadoFormularioMiembro {
  error?: string;
}

// Guarda la foto en apps/web-admin/public/uploads/miembros y devuelve la URL
// pública. Nota: en un deploy Docker "standalone" esta carpeta vive dentro
// del contenedor — sin un volumen montado ahí, las fotos no sobreviven un
// rebuild. Pendiente para cuando se arme el deploy real (Fase E).
async function guardarFoto(archivo: FormDataEntryValue | null): Promise<string | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null;

  const extension = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
  const nombreArchivo = `${randomUUID()}.${extension}`;
  const carpeta = path.join(process.cwd(), "public", "uploads", "miembros");

  await mkdir(carpeta, { recursive: true });
  await writeFile(path.join(carpeta, nombreArchivo), Buffer.from(await archivo.arrayBuffer()));

  return `/uploads/miembros/${nombreArchivo}`;
}

export async function crearMiembroAction(
  _estadoPrevio: EstadoFormularioMiembro,
  formData: FormData
): Promise<EstadoFormularioMiembro> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const cedula = formData.get("cedula")?.toString().trim();
  const fechaInscripcionTexto = formData.get("fechaInscripcion")?.toString();
  const precioPlan = Number(formData.get("precioPlan"));

  if (!nombre || !cedula || !fechaInscripcionTexto || Number.isNaN(precioPlan)) {
    return { error: "Nombre, cédula, fecha de inscripción y precio del plan son requeridos." };
  }

  const fotoUrl = await guardarFoto(formData.get("foto"));

  try {
    await crearMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        nombre,
        cedula,
        fechaInscripcion: new Date(`${fechaInscripcionTexto}T00:00:00`),
        fechaNacimiento: null,
        celular: formData.get("celular")?.toString() || null,
        fotoUrl,
        entrenadorId: formData.get("entrenadorId")?.toString() || null,
        planTipo: (formData.get("planTipo")?.toString() as PlanTipo) ?? "SIN_ENTRENADOR",
        precioPlan,
      }
    );
  } catch (error) {
    if (error instanceof CedulaDuplicadaError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/miembros");
  redirect("/miembros");
}

export async function actualizarMiembroAction(
  id: string,
  _estadoPrevio: EstadoFormularioMiembro,
  formData: FormData
): Promise<EstadoFormularioMiembro> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const fechaInscripcionTexto = formData.get("fechaInscripcion")?.toString();
  const precioPlan = Number(formData.get("precioPlan"));

  if (!nombre || !fechaInscripcionTexto || Number.isNaN(precioPlan)) {
    return { error: "Nombre, fecha de inscripción y precio del plan son requeridos." };
  }

  const fotoUrl = await guardarFoto(formData.get("foto"));

  try {
    await actualizarMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        id,
        cambios: {
          nombre,
          fechaInscripcion: new Date(`${fechaInscripcionTexto}T00:00:00`),
          celular: formData.get("celular")?.toString() || null,
          entrenadorId: formData.get("entrenadorId")?.toString() || null,
          planTipo: formData.get("planTipo")?.toString() as PlanTipo,
          precioPlan,
          ...(fotoUrl ? { fotoUrl } : {}),
        },
      }
    );
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/miembros");
  redirect("/miembros");
}

export async function darDeBajaAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarMiembro(
    { miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: false } }
  );

  revalidatePath("/miembros");
}

export async function reactivarAction(id: string): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  await actualizarMiembro(
    { miembros: new PrismaMemberRepository(prisma) },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: true } }
  );

  revalidatePath("/miembros");
}
