"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaMetodoPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaMetodoPagoRepository";
import { PrismaTasaCambioRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaTasaCambioRepository";
import { R2StorageService } from "@gym-app/infrastructure/storage/R2StorageService";
import { crearMetodoPago } from "@gym-app/domain/use-cases/CrearMetodoPago";
import { actualizarMetodoPago, MetodoPagoNoEncontradoError } from "@gym-app/domain/use-cases/ActualizarMetodoPago";
import { registrarTasaManual } from "@gym-app/domain/use-cases/RegistrarTasaManual";
import type { TipoMetodoPago, MonedaMetodoPago } from "@gym-app/domain/entities/MetodoPago";

export interface EstadoFormularioMetodoPago {
  error?: string;
}

const SOLO_SOCIO = "Solo el socio puede administrar los métodos de pago.";

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

async function guardarLogo(archivo: FormDataEntryValue | null): Promise<string | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null;

  const extension = archivo.name.split(".").pop()?.toLowerCase() || "png";
  const nombreArchivo = `${randomUUID()}.${extension}`;
  const contenido = Buffer.from(await archivo.arrayBuffer());

  return storageR2().subir("logos-pagos", nombreArchivo, contenido, archivo.type || "image/png");
}

function leerCoordenadas(formData: FormData) {
  return {
    codigoBanco: formData.get("codigoBanco")?.toString().trim() || null,
    telefono: formData.get("telefono")?.toString().trim() || null,
    rif: formData.get("rif")?.toString().trim() || null,
    numeroCuenta: formData.get("numeroCuenta")?.toString().trim() || null,
    beneficiario: formData.get("beneficiario")?.toString().trim() || null,
    walletDireccion: formData.get("walletDireccion")?.toString().trim() || null,
    walletUsuario: formData.get("walletUsuario")?.toString().trim() || null,
  };
}

export async function crearMetodoPagoAction(
  _estadoPrevio: EstadoFormularioMetodoPago,
  formData: FormData
): Promise<EstadoFormularioMetodoPago> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "SOCIO") return { error: SOLO_SOCIO };

  const tipo = formData.get("tipo")?.toString() as TipoMetodoPago | undefined;
  const moneda = formData.get("moneda")?.toString() as MonedaMetodoPago | undefined;
  const nombreBanco = formData.get("nombreBanco")?.toString().trim() || null;

  if (!tipo || !moneda) {
    return { error: "Tipo y moneda son requeridos." };
  }

  const logoExistenteUrl = formData.get("logoUrl")?.toString() || null;
  const logoUrl = (await guardarLogo(formData.get("logo"))) ?? logoExistenteUrl;

  await crearMetodoPago(
    { metodosPago: new PrismaMetodoPagoRepository(prisma) },
    {
      organizacionId: usuario.organizacionId,
      tipo,
      nombreBanco,
      logoUrl,
      moneda,
      ...leerCoordenadas(formData),
    }
  );

  revalidatePath("/configuraciones/metodos-pago");
  redirect("/configuraciones/metodos-pago");
}

export async function actualizarMetodoPagoAction(
  id: string,
  _estadoPrevio: EstadoFormularioMetodoPago,
  formData: FormData
): Promise<EstadoFormularioMetodoPago> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "SOCIO") return { error: SOLO_SOCIO };

  const moneda = formData.get("moneda")?.toString() as MonedaMetodoPago | undefined;
  const nombreBanco = formData.get("nombreBanco")?.toString().trim() || null;

  if (!moneda) {
    return { error: "Moneda es requerida." };
  }

  const logoExistenteUrl = formData.get("logoUrl")?.toString() || null;
  const logoUrl = (await guardarLogo(formData.get("logo"))) ?? logoExistenteUrl;

  try {
    await actualizarMetodoPago(
      { metodosPago: new PrismaMetodoPagoRepository(prisma) },
      {
        organizacionId: usuario.organizacionId,
        id,
        cambios: {
          nombreBanco,
          logoUrl,
          moneda,
          ...leerCoordenadas(formData),
        },
      }
    );
  } catch (error) {
    if (error instanceof MetodoPagoNoEncontradoError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/configuraciones/metodos-pago");
  redirect("/configuraciones/metodos-pago");
}

export async function alternarActivoMetodoPagoAction(id: string, activo: boolean): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "SOCIO") return;

  await actualizarMetodoPago(
    { metodosPago: new PrismaMetodoPagoRepository(prisma) },
    { organizacionId: usuario.organizacionId, id, cambios: { activo } }
  ).catch(() => null);

  revalidatePath("/configuraciones/metodos-pago");
}

export interface EstadoTasaManual {
  error?: string;
}

// Ingreso manual de la tasa BCV cuando la API de tasa falla — con doble
// confirmación en el cliente (ver diseño acordado). Se persiste en
// TasaCambio con fuente MANUAL para que quede disponible para toda la
// organización, no solo para ese pago puntual.
export async function registrarTasaManualAction(
  _estadoPrevio: EstadoTasaManual,
  formData: FormData
): Promise<EstadoTasaManual> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const valorTexto = formData.get("valor")?.toString().trim();
  const valor = Number(valorTexto);

  if (!valorTexto || Number.isNaN(valor) || valor <= 0) {
    return { error: "Ingresá un valor de tasa válido." };
  }

  await registrarTasaManual({ tasas: new PrismaTasaCambioRepository(prisma) }, { valor });

  revalidatePath("/pagos/nuevo");
  revalidatePath("/miembros");
  return {};
}
