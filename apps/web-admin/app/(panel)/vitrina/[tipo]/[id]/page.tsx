import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { puedeEditarKiosko } from "@/lib/permisoKiosko";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { Card } from "@gym-app/ui/components/Card";
import { BotonEliminarItem } from "../../BotonEliminarItem";
import { FormularioVitrinaItem } from "../../FormularioVitrinaItem";
import { SLUG_DE_TIPO, tipoDeSlug } from "../../slugs";

export default async function PaginaEditarVitrina({ params }: { params: Promise<{ tipo: string; id: string }> }) {
  const { tipo: slug, id } = await params;
  const tipo = tipoDeSlug(slug);
  if (!tipo) notFound();
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  if (!puedeEditarKiosko(sesion.usuario.rol)) redirect("/miembros");

  const item = await new PrismaVitrinaRepository(prisma).buscar(sesion.sucursalActivaId, id);
  if (!item || item.tipo !== tipo) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <FormularioVitrinaItem key={item.id} tipo={tipo} item={item} />
      </Card>
      <BotonEliminarItem id={item.id} volver={`/vitrina/${SLUG_DE_TIPO[tipo]}`} />
    </div>
  );
}
