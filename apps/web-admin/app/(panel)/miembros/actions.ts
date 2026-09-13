"use server";

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

export async function crearMiembroAction(
  _estadoPrevio: EstadoFormularioMiembro,
  formData: FormData
): Promise<EstadoFormularioMiembro> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const nombre = formData.get("nombre")?.toString().trim();
  const cedula = formData.get("cedula")?.toString().trim();
  const precioPlan = Number(formData.get("precioPlan"));

  if (!nombre || !cedula || Number.isNaN(precioPlan)) {
    return { error: "Nombre, cédula y precio del plan son requeridos." };
  }

  try {
    await crearMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        nombre,
        cedula,
        fechaNacimiento: null,
        celular: formData.get("celular")?.toString() || null,
        fotoUrl: null,
        entrenadorId: null,
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
  const precioPlan = Number(formData.get("precioPlan"));

  if (!nombre || Number.isNaN(precioPlan)) {
    return { error: "Nombre y precio del plan son requeridos." };
  }

  try {
    await actualizarMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        id,
        cambios: {
          nombre,
          celular: formData.get("celular")?.toString() || null,
          planTipo: formData.get("planTipo")?.toString() as PlanTipo,
          precioPlan,
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
