"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMemberRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMemberRepository";
import { PrismaPlanRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPlanRepository";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaSuscripcionRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSuscripcionRepository";
import { crearMiembro, CedulaDuplicadaError } from "@gym-app/domain/use-cases/CrearMiembro";
import {
  actualizarMiembro,
  MiembroNoEncontradoError,
  PlanNoEncontradoError as ActualizarPlanNoEncontradoError,
} from "@gym-app/domain/use-cases/ActualizarMiembro";
import { listarPlanes } from "@gym-app/domain/use-cases/ListarPlanes";
import { crearPlan } from "@gym-app/domain/use-cases/CrearPlan";
import { PrismaTurnoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTurnoRepository";
import { PrismaPermisoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPermisoRepository";
import { AuthorizationService } from "@gym-app/domain/services/AuthorizationService";
import { R2StorageService } from "@gym-app/infrastructure/storage/R2StorageService";
import {
  registrarPago,
  MiembroNoEncontradoError as PagoMiembroNoEncontradoError,
  PlanNoEncontradoError,
  PlanInactivoError,
  RolNoAutorizadoError as PagoRolNoAutorizadoError,
} from "@gym-app/domain/use-cases/RegistrarPago";
import type { FrecuenciaPago } from "@gym-app/domain/entities/Plan";
import { conMensajeOk } from "../redirectConMensaje";

export interface EstadoFormularioMiembro {
  error?: string;
}

// El plan "Personalizado" no tiene pantalla propia de alta — se crea/reusa
// una única vez por organización+frecuencia+entrenador, la primera vez que
// alguien lo usa desde el formulario de Nuevo/Editar Miembro. /planes lo
// lista y edita después como a cualquier otro plan.
async function obtenerOCrearPlanPersonalizado(
  organizacionId: string,
  frecuencia: FrecuenciaPago,
  incluyeEntrenador: boolean,
  precioUSD: number
): Promise<string> {
  const planes = await listarPlanes({ planes: new PrismaPlanRepository(prisma) }, organizacionId);
  const existente = planes.find(
    (plan) => plan.nombre === "Personalizado" && plan.frecuencia === frecuencia && plan.incluyeEntrenador === incluyeEntrenador
  );
  if (existente) return existente.id;

  const nuevo = await crearPlan(
    { planes: new PrismaPlanRepository(prisma) },
    { organizacionId, nombre: "Personalizado", frecuencia, incluyeEntrenador, precioUSD, multisede: false }
  );
  return nuevo.id;
}

const ID_AMBAS_SEDES = "__ambas__";

// "Ambas" en el selector de sede se traduce a null (sin restricción de
// sucursal) — ver diseño acordado del checkbox Plan.multisede.
function resolverSucursalId(valor: string | undefined): string | null {
  if (!valor || valor === ID_AMBAS_SEDES) return null;
  return valor;
}

// Resuelve el planId a partir de los campos del formulario: o bien un Plan
// real del catálogo (planId ya viene armado), o bien "Personalizado"
// (busca/crea el Plan ad-hoc con la frecuencia y entrenador elegidos).
async function resolverPlanId(organizacionId: string, formData: FormData, precioPlan: number): Promise<string | null> {
  const planIdElegido = formData.get("planId")?.toString();
  if (planIdElegido) return planIdElegido;

  const esPersonalizado = formData.get("planPersonalizado")?.toString() === "1";
  if (!esPersonalizado) return null;

  const frecuencia = (formData.get("frecuenciaPersonalizada")?.toString() as FrecuenciaPago) || "MENSUAL";
  const incluyeEntrenador = formData.get("entrenadorPersonalizado")?.toString() === "1";

  return obtenerOCrearPlanPersonalizado(organizacionId, frecuencia, incluyeEntrenador, precioPlan);
}

function storageR2(): R2StorageService {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error(
      "Faltan variables de entorno de R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL)."
    );
  }

  return new R2StorageService({ accountId, accessKeyId, secretAccessKey, bucket, publicUrl });
}

// Sube la foto al bucket "gym-app" en Cloudflare R2 (carpeta "miembros") y
// devuelve la URL pública (dominio R2.dev configurado en R2_PUBLIC_URL).
async function guardarFoto(archivo: FormDataEntryValue | null): Promise<string | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null;

  const extension = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
  const nombreArchivo = `${randomUUID()}.${extension}`;
  const contenido = Buffer.from(await archivo.arrayBuffer());

  return storageR2().subir("miembros", nombreArchivo, contenido, archivo.type || "application/octet-stream");
}

export async function crearMiembroAction(
  _estadoPrevio: EstadoFormularioMiembro,
  formData: FormData
): Promise<EstadoFormularioMiembro> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const nombre = formData.get("nombre")?.toString().trim();
  const cedula = formData.get("cedula")?.toString().trim();
  const fechaInscripcionTexto = formData.get("fechaInscripcion")?.toString();
  const sucursalId = formData.get("sucursalId")?.toString();
  const precioPlan = Number(formData.get("precioPlan"));
  const metodo = formData.get("metodo")?.toString();
  const metodoPagoId = formData.get("metodoPagoId")?.toString() || null;
  const tasaCambioRaw = formData.get("tasaCambio")?.toString();
  const numeroOperacion = formData.get("numeroOperacion")?.toString().trim() || null;
  // Sede elegida en el selector "Sede del pago" (ver SelectorMetodoPago);
  // si no vino, se cae a la sede activa de la sesión.
  const sucursalIdPago = formData.get("sucursalIdPago")?.toString() || sucursalActivaId;

  if (!nombre || !cedula || !fechaInscripcionTexto || !sucursalId || !metodo || !metodoPagoId || Number.isNaN(precioPlan)) {
    return { error: "Nombre, cédula, fecha de inscripción, sede y método de pago son requeridos." };
  }

  const planId = await resolverPlanId(usuario.organizacionId, formData, precioPlan);
  if (!planId) {
    return { error: "Elegí un plan para el miembro." };
  }

  const fotoUrl = await guardarFoto(formData.get("foto"));

  let miembro;
  try {
    miembro = await crearMiembro(
      { miembros: new PrismaMemberRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        sucursalId: resolverSucursalId(sucursalId),
        nombre,
        cedula,
        fechaInscripcion: new Date(`${fechaInscripcionTexto}T00:00:00`),
        fechaNacimiento: null,
        celular: formData.get("celular")?.toString() || null,
        fotoUrl,
        entrenadorId: formData.get("entrenadorId")?.toString() || null,
        planId,
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
  if (!sucursalIdPago) {
    return {
      error: "El miembro se creó, pero no se pudo registrar el pago inicial: no se pudo determinar en qué sucursal se registra el pago.",
    };
  }

  try {
    await registrarPago(
      {
        pagos: new PrismaPagoRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        turnos: new PrismaTurnoRepository(prisma),
        autorizacion: new AuthorizationService(new PrismaPermisoRepository(prisma)),
      },
      {
        organizacionId: usuario.organizacionId,
        miembroId: miembro.id,
        planId,
        monto: precioPlan,
        metodo,
        metodoPagoId,
        numeroOperacion,
        tasaCambio: tasaCambioRaw ? Number(tasaCambioRaw) : null,
        sucursalId: sucursalIdPago,
        registradoPorId: usuario.id,
        rolUsuario: usuario.rol,
      }
    );
  } catch (error) {
    if (
      error instanceof PagoMiembroNoEncontradoError ||
      error instanceof PlanNoEncontradoError ||
      error instanceof PlanInactivoError ||
      error instanceof PagoRolNoAutorizadoError
    ) {
      return { error: `El miembro se creó, pero no se pudo registrar el pago inicial: ${error.message}` };
    }
    throw error;
  }

  revalidatePath("/miembros");
  revalidatePath("/planes");
  revalidatePath("/pagos");
  redirect(conMensajeOk("/miembros", "Miembro creado y pago inicial registrado."));
}

export async function actualizarMiembroAction(
  id: string,
  _estadoPrevio: EstadoFormularioMiembro,
  formData: FormData
): Promise<EstadoFormularioMiembro> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  const nombre = formData.get("nombre")?.toString().trim();
  const fechaInscripcionTexto = formData.get("fechaInscripcion")?.toString();
  const sucursalId = formData.get("sucursalId")?.toString();
  const precioPlan = Number(formData.get("precioPlan"));

  if (!nombre || !fechaInscripcionTexto || !sucursalId || Number.isNaN(precioPlan)) {
    return { error: "Nombre, fecha de inscripción, sede y precio del plan son requeridos." };
  }

  const planId = await resolverPlanId(usuario.organizacionId, formData, precioPlan);
  const fotoUrl = await guardarFoto(formData.get("foto"));

  try {
    await actualizarMiembro(
      {
        miembros: new PrismaMemberRepository(prisma),
        planes: new PrismaPlanRepository(prisma),
        suscripciones: new PrismaSuscripcionRepository(prisma),
      },
      {
        organizacionId: usuario.organizacionId,
        id,
        cambios: {
          nombre,
          sucursalId: resolverSucursalId(sucursalId),
          fechaInscripcion: new Date(`${fechaInscripcionTexto}T00:00:00`),
          celular: formData.get("celular")?.toString() || null,
          entrenadorId: formData.get("entrenadorId")?.toString() || null,
          ...(planId ? { planId } : {}),
          precioPlan,
          ...(fotoUrl ? { fotoUrl } : {}),
        },
      }
    );
  } catch (error) {
    if (error instanceof MiembroNoEncontradoError || error instanceof ActualizarPlanNoEncontradoError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/miembros");
  redirect(conMensajeOk(`/miembros/${id}`, "Cambios guardados."));
}

export async function darDeBajaAction(id: string): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  await actualizarMiembro(
    {
      miembros: new PrismaMemberRepository(prisma),
      planes: new PrismaPlanRepository(prisma),
      suscripciones: new PrismaSuscripcionRepository(prisma),
    },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: false } }
  );

  revalidatePath("/miembros");
}

export async function reactivarAction(id: string): Promise<void> {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario } = sesion;

  await actualizarMiembro(
    {
      miembros: new PrismaMemberRepository(prisma),
      planes: new PrismaPlanRepository(prisma),
      suscripciones: new PrismaSuscripcionRepository(prisma),
    },
    { organizacionId: usuario.organizacionId, id, cambios: { activo: true } }
  );

  revalidatePath("/miembros");
}
