"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { crearMiembro, CedulaDuplicadaError } from "@gym-app/domain/use-cases/CrearMiembro";
import { actualizarMiembro, MiembroNoEncontradoError } from "@gym-app/domain/use-cases/ActualizarMiembro";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { crearPlan } from "@gym-app/domain/use-cases/CrearPlan";
import {
  registrarPago,
  MiembroNoEncontradoError as PagoMiembroNoEncontradoError,
  PlanNoEncontradoError,
  PlanInactivoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
import type { PlanTipo } from "@gym-app/domain/entities/Miembro";
import { METODOS_BANCARIOS } from "../metodosPago";

export interface EstadoFormularioMiembro {
  error?: string;
}

// Los planes fijos del selector de Nuevo Miembro (Semanal, Corporativo,
// etc., más "Personalizado") no tienen pantalla propia de alta — se crean
// solos, una única vez por organización, la primera vez que alguien los
// usa. /planes los lista y edita después como a cualquier otro plan.
async function obtenerOCrearPlan(organizacionId: string, nombre: string, precioUSD: number): Promise<string> {
  const planes = await listarPlanes({ planes: new PrismaPlanRepository(prisma) }, organizacionId);
  const existente = planes.find((plan) => plan.nombre === nombre);
  if (existente) return existente.id;

  const nuevo = await crearPlan(
    { planes: new PrismaPlanRepository(prisma) },
    { organizacionId, nombre, tipoAcceso: "TODA_LA_ORGANIZACION", precioUSD, sucursalIds: [] }
  );
  return nuevo.id;
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
  const planNombre = formData.get("planNombre")?.toString().trim();
  const metodo = formData.get("metodo")?.toString();
  const tasaCambioRaw = formData.get("tasaCambio")?.toString();
  const numeroOperacion = formData.get("numeroOperacion")?.toString().trim() || null;

  if (!nombre || !cedula || !fechaInscripcionTexto || !planNombre || !metodo || Number.isNaN(precioPlan)) {
    return { error: "Nombre, cédula, fecha de inscripción, plan y método de pago son requeridos." };
  }

  if (METODOS_BANCARIOS.includes(metodo) && !numeroOperacion) {
    return { error: "El número de operación es requerido para pagos por banco." };
  }

  const fotoUrl = await guardarFoto(formData.get("foto"));

  let miembro;
  try {
    miembro = await crearMiembro(
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

  // El miembro ya quedó creado en este punto — un error acá abajo no lo
  // deshace, así que solo se manejan los errores de dominio esperables;
  // cualquier otra cosa se deja propagar (el miembro queda creado, sin
  // pago, y se puede registrar a mano desde su ficha).
  try {
    const planId = await obtenerOCrearPlan(usuario.organizacionId, planNombre, precioPlan);

    await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId: miembro.id,
        planId,
        monto: precioPlan,
        metodo,
        numeroOperacion,
        tasaCambio: tasaCambioRaw ? Number(tasaCambioRaw) : null,
      }
    );
  } catch (error) {
    if (
      error instanceof PagoMiembroNoEncontradoError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError
    ) {
      return { error: `El miembro se creó, pero no se pudo registrar el pago inicial: ${error.message}` };
    }
    throw error;
  }

  revalidatePath("/miembros");
  revalidatePath("/planes");
  revalidatePath("/pagos");
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
