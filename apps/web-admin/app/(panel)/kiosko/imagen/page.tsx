import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { PrismaSucursalRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaSucursalRepository";
import { Card } from "@gym-app/ui/components/Card";
import { FormularioImagenKiosko } from "./FormularioImagenKiosko";

export default async function PaginaImagenKiosko() {
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  const { usuario, sucursalActivaId } = sesion;

  const sucursal = await new PrismaSucursalRepository(prisma).buscarPorId(usuario.organizacionId, sucursalActivaId);

  // El placeholder original vive en R2 (carpeta kiosko/) para poder ajustarle el encuadre desde el panel.
  const imagenPlaceholder = `${process.env.R2_PUBLIC_URL}/kiosko/placeholder-profile.jpg`;

  return (
    <Card className="max-w-2xl">
      <p className="mb-4 text-sm" style={{ color: "var(--gx-muted)" }}>
        Imagen del círculo y transparencia del fondo de la ficha en reposo del kiosco. Los cambios llegan en menos de 30
        segundos.
      </p>
      <FormularioImagenKiosko
        imagenActualUrl={sucursal?.reposoImagenUrl ?? imagenPlaceholder}
        esPersonalizada={!!sucursal?.reposoImagenUrl}
        opacidadInicial={sucursal?.reposoOpacidad ?? 100}
      />
    </Card>
  );
}
