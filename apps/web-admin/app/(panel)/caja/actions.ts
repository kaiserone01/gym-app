"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaPagoRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaPagoRepository";
import { PrismaCierreCajaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaCierreCajaRepository";
import { cerrarCaja, DiaYaCerradoError } from "@gym-app/domain/use-cases/CerrarCaja";

export async function cerrarCajaAction(formData: FormData): Promise<void> {
  const usuario = await obtenerUsuarioDeSesionActual();
  if (!usuario) redirect("/login");

  const fechaTexto = formData.get("fecha")?.toString();
  if (!fechaTexto) redirect("/caja");

  try {
    await cerrarCaja(
      { cierres: new PrismaCierreCajaRepository(prisma), pagos: new PrismaPagoRepository(prisma) },
      { organizacionId: usuario.organizacionId, fecha: new Date(`${fechaTexto}T00:00:00`) }
    );
  } catch (error) {
    if (!(error instanceof DiaYaCerradoError)) {
      throw error;
    }
    // Ya estaba cerrado (ej. doble clic) — no es un error real, seguimos.
  }

  revalidatePath("/caja");
  redirect(`/caja?fecha=${fechaTexto}&periodo=dia`);
}
