import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { obtenerUsuarioDeSesionActual } from "@/lib/sesion";
import { puedeEditarKiosko } from "@/lib/permisoKiosko";
import { PrismaVitrinaRepository } from "@gym-app/infrastructure/persistence/prisma/PrismaVitrinaRepository";
import { Card } from "@gym-app/ui/components/Card";
import { FilaVitrina } from "../FilaVitrina";
import { SLUG_DE_TIPO, TITULO_DE_TIPO, tipoDeSlug } from "../slugs";

export default async function PaginaListaVitrina({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo: slug } = await params;
  const tipo = tipoDeSlug(slug);
  if (!tipo) notFound();
  const sesion = await obtenerUsuarioDeSesionActual();
  if (!sesion) redirect("/login");
  if (!puedeEditarKiosko(sesion.usuario.rol)) redirect("/miembros");

  const items = (await new PrismaVitrinaRepository(prisma).listar(sesion.sucursalActivaId)).filter((i) => i.tipo === tipo);
  const ahora = new Date();
  const nuevo = (
    <Link
      href={`/vitrina/${SLUG_DE_TIPO[tipo]}/nuevo`}
      className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-4 text-sm font-semibold hover:opacity-90"
      style={{ background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }}
    >
      Nuevo {TITULO_DE_TIPO[tipo].toLowerCase()}
    </Link>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-3">
      {items.length === 0 ? (
        <Card className="flex flex-col items-start gap-3">
          <p style={{ color: "var(--gx-muted)" }}>Todavía no hay {slug}. Los nuevos nacen inactivos hasta que los actives.</p>
          {nuevo}
        </Card>
      ) : (
        <>
          <div>{nuevo}</div>
          {items.map((item) => (
            <FilaVitrina key={item.id} item={item} ahora={ahora} />
          ))}
        </>
      )}
    </div>
  );
}
